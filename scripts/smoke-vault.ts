import { assertOwnerTransaction } from "./lib/owner-transaction";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { verifyTransactionSignature } from "@mysten/sui/verify";
import { makeSuiClient, WalrusStore, WALRUS_ENDPOINTS, buildReasoningEvidence, publishEvidence, buildCreateVault, buildDepositVault, buildAuthorizeVaultAgent, buildRevokeVaultAgent, buildWithdrawVault, buildVaultSpend, readVaultState, readVaultGrant, prepareVaultSubmission, readJournaledVaultOutcome, submitJournaledVaultPayment, type VaultSubmission, type VaultSubmissionJournal } from "@allen-saji/praxis";
import { TestnetDelegateStore } from "@allen-saji/praxis/testnet-signer";

const GAS = 20_000_000n;
const DEPOSIT = 10_000_000n;
const PAYMENT = 1_000_000n;
const DELEGATE_GAS = 20_000_000n;
const deployment = JSON.parse(await readFile(new URL("../deployments/testnet-vault.json", import.meta.url), "utf8")) as { network: string; packageId: string; publisher: string };
const owner = process.env.PRAXIS_VAULT_SMOKE_OWNER ?? deployment.publisher;
const recipient = process.env.PRAXIS_VAULT_SMOKE_RECIPIENT;
const runId = process.env.PRAXIS_VAULT_SMOKE_RUN_ID;
const execute = process.argv.includes("--execute");
const plan = { publicEvidence: "Walrus Testnet", network: "testnet", packageId: deployment.packageId, owner, recipient: recipient ?? "required before execution", runId: runId ?? "required before execution", depositMist: DEPOSIT.toString(), paymentCount: 2, amountPerPaymentMist: PAYMENT.toString(), delegateGasFundingEachMist: DELEGATE_GAS.toString(), ownerTransactionCount: 7, totalTransactionCount: 9, perTransactionGasCeilingMist: GAS.toString(), maximumOwnerDebitBeforeWithdrawalMist: "190000000", expectedPrincipalWithdrawalMist: "8000000", leftoverDelegateGas: "Retained in the two scoped Testnet keys", execute };
console.log(JSON.stringify(plan, null, 2));
if (!execute) process.exit(0);
if (process.env.PRAXIS_VAULT_SMOKE_CONFIRM !== "APPROVED_TESTNET_VAULT_ACCEPTANCE") throw new Error("Explicit bounded Testnet acceptance approval is required");
if (!recipient || !/^0x[0-9a-f]{64}$/.test(recipient) || !runId || !/^[a-zA-Z0-9_-]{1,64}$/.test(runId)) throw new Error("A canonical recipient and stable run ID are required");
if (deployment.network !== "testnet" || execFileSync("sui", ["client", "active-env"], { encoding: "utf8" }).trim() !== "testnet" || execFileSync("sui", ["client", "active-address"], { encoding: "utf8" }).trim() !== owner) throw new Error("Approved Testnet owner does not match CLI configuration");
const root = resolve(".praxis", "vault-acceptance", runId);
await mkdir(root, { recursive: true, mode: 0o700 });
const manifestPath = resolve(root, "plan.json");
let expiresMs: bigint;
try {
  const saved = JSON.parse(await readFile(manifestPath, "utf8"));
  if (JSON.stringify(saved.plan) !== JSON.stringify(plan)) throw new Error("Run plan changed; do not reuse this run ID");
  expiresMs = BigInt(saved.expiresMs);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  expiresMs = BigInt(Date.now() + 24 * 60 * 60 * 1000);
  const manifest = await open(manifestPath, "wx", 0o600);
  try { await manifest.writeFile(JSON.stringify({ plan, expiresMs: expiresMs.toString() })); await manifest.sync(); } finally { await manifest.close(); }
}
const client = makeSuiClient("testnet");
const started = await readFile(resolve(root, "create.json"), "utf8").then(() => true, () => false);
if (!started && BigInt((await client.getBalance({ owner, coinType: "0x2::sui::SUI" })).balance.balance) < 190_000_000n) throw new Error("Owner balance is below the bounded-run maximum");
async function durableWrite(path: string, value: unknown) {
  const file = await open(path, "wx", 0o600);
  try { await file.writeFile(encode(value)); await file.sync(); } finally { await file.close(); }
  const directory = await open(root, "r");
  try { await directory.sync(); } finally { await directory.close(); }
}
const encode = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2);
async function readOptional(path: string): Promise<any | null> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
let previousOwner: { digest: string; gas: any } | undefined;
async function ownerStep(name: string, build: () => Transaction) {
  let path = resolve(root, `${name}.json`);
  let row = await readOptional(path);
  if (row && previousOwner && row.digest !== previousOwner.digest) {
    const gas = Transaction.from(Buffer.from(row.bytes, "base64")).getData().gasData.payment ?? [];
    const consumed = previousOwner.gas;
    // A different confirmed transaction consumed this exact gas reference. The
    // saved transaction can never execute; retain it and journal a replacement.
    if (gas.some((coin) => coin.objectId === consumed?.objectId && coin.version === consumed.inputVersion && coin.digest === consumed.inputDigest)) {
      path = resolve(root, `${name}.replacement.json`);
      row = await readOptional(path);
    }
  }
  if (!row) {
    const tx = build(); tx.setSender(owner); tx.setGasBudget(GAS);
    if (previousOwner?.gas?.outputVersion && previousOwner.gas.outputDigest) tx.setGasPayment([{ objectId: previousOwner.gas.objectId, version: previousOwner.gas.outputVersion, digest: previousOwner.gas.outputDigest }]);
    const bytes = await tx.build({ client });
    const preview = await client.simulateTransaction({ transaction: bytes, checksEnabled: true, include: { effects: true } });
    if (preview.$kind !== "Transaction" || !preview.Transaction.status.success) throw new Error(`${name}: simulation failed`);
    const signed = JSON.parse(execFileSync("sui", ["keytool", "sign", "--address", owner, "--data", Buffer.from(bytes).toString("base64"), "--json"], { encoding: "utf8" }));
    const signature = signed.suiSignature ?? signed.signature;
    if ((await verifyTransactionSignature(bytes, signature)).toSuiAddress() !== owner) throw new Error("Owner signature mismatch");
    row = { bytes: Buffer.from(bytes).toString("base64"), signature, digest: TransactionDataBuilder.getDigestFromBytes(bytes) };
    await durableWrite(path, row);
  }
  const signedBytes = Buffer.from(row.bytes, "base64");
  assertOwnerTransaction(signedBytes, build(), owner, GAS);
  if (TransactionDataBuilder.getDigestFromBytes(signedBytes) !== row.digest || (await verifyTransactionSignature(signedBytes, row.signature)).toSuiAddress() !== owner) throw new Error("Stored owner signature or digest mismatch");
  let result;
  try { result = await client.getTransaction({ digest: row.digest, include: { effects: true, objectTypes: true } }); } catch { /* Retry exactly the persisted bytes. */ }
  if (!result) result = await client.executeTransaction({ transaction: Buffer.from(row.bytes, "base64"), signatures: [row.signature], include: { effects: true, objectTypes: true } });
  if (result.$kind !== "Transaction" || !result.Transaction.status.success || result.Transaction.digest !== row.digest) throw new Error(`${name}: transaction failed or is unresolved; preserve this run`);
  previousOwner = { digest: row.digest, gas: result.Transaction.effects?.gasObject };
  // Allow public RPC replicas to observe newly shared objects before the next build.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  console.log(JSON.stringify({ step: name, digest: row.digest, status: "confirmed" }));
  return result.Transaction;
}
const completed = await readOptional(resolve(root, "complete.json"));
if (completed) { console.log(JSON.stringify({ ...completed, replay: true })); process.exit(0); }
const recipientStartPath = resolve(root, "recipient-start.json");
let recipientStart = await readOptional(recipientStartPath);
if (!recipientStart) { recipientStart = { balance: (await client.getBalance({ owner: recipient, coinType: "0x2::sui::SUI" })).balance.balance }; await durableWrite(recipientStartPath, recipientStart); }
const created = await ownerStep("create", () => buildCreateVault({ packageId: deployment.packageId, owner, perPayment: PAYMENT, allowance: DEPOSIT, recipients: [recipient] }));
const vaultId = Object.entries(created.objectTypes ?? {}).find(([, type]) => type === `${deployment.packageId}::vault::Vault`)?.[0];
if (!vaultId) throw new Error("Created vault was not found");
const target = { packageId: deployment.packageId, vaultId, owner };
await ownerStep("deposit", () => buildDepositVault({ ...target, amount: DEPOSIT }));
const masterPath = resolve(root, "testnet-master.key");
try {
  const master = await open(masterPath, "wx", 0o600);
  try { await master.writeFile(randomBytes(32)); await master.sync(); } finally { await master.close(); }
  const directory = await open(root, "r"); try { await directory.sync(); } finally { await directory.close(); }
} catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
const store = new TestnetDelegateStore({ directory: resolve(root, "delegates"), masterKey: await readFile(masterPath), packageId: target.packageId, maxGas: GAS });
const agentScopes = ["research", "trading"].map((name) => ({ name, organizationId: `acceptance-${runId}`, assignmentId: name, packageId: target.packageId, vaultId, agent: `0x${createHash("sha256").update(`${runId}:${name}`).digest("hex")}` }));
const agents = await Promise.all(agentScopes.map(async (scope) => ({ ...scope, delegate: (await store.provision(scope)).address })));
for (const agent of agents) await ownerStep(`authorize-${agent.name}`, () => buildAuthorizeVaultAgent({ ...target, agent: agent.agent, delegate: agent.delegate, perPayment: PAYMENT, allowance: 5_000_000n, daily: agent.name === "research" ? PAYMENT : 3_000_000n, monthly: 5_000_000n, recipients: [recipient], expiresMs }));
await ownerStep("fund-gas", () => {
  const tx = new Transaction();
  for (const agent of agents) { const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(DELEGATE_GAS)]); tx.transferObjects([coin], agent.delegate); }
  return tx;
});
const evidenceStore = new WalrusStore({ ...WALRUS_ENDPOINTS.testnet, mode: "hosted", timeoutMs: 60000, maxBodyBytes: 65536 });
const journal: VaultSubmissionJournal = {
  async saveOnce(value) { await durableWrite(resolve(root, `${value.intentId}.payment.json`), value); },
  async load(id) {
    const row = await readOptional(resolve(root, `${id}.payment.json`));
    if (!row) return null;
    const request = row.request;
    return { ...row, gasBudget: BigInt(row.gasBudget), request: { ...request, amount: BigInt(request.amount), sequence: BigInt(request.sequence), vaultVersion: BigInt(request.vaultVersion), grantVersion: BigInt(request.grantVersion) } } as VaultSubmission;
  },
};
for (const agent of agents) {
  if (!await journal.load(agent.name)) {
    const state = await readVaultState(client, target);
    const grant = await readVaultGrant(client, target.packageId, state, agent.agent);
    const evidencePath = resolve(root, `${agent.name}.evidence.json`);
    let evidence = await readOptional(evidencePath);
    if (!evidence) {
      const document = buildReasoningEvidence({ schemaVersion: 3, runId, scenario: "bounded vault acceptance", vaultId, agent: agent.agent, recipient, amountMist: PAYMENT.toString(), reason: "Verify an owner-approved Testnet allowance" });
      evidence = await publishEvidence({ port: evidenceStore, evidence: document, hosted: true });
      await durableWrite(evidencePath, evidence);
    }
    const request = { ...target, delegate: agent.delegate, agent: agent.agent, recipient, amount: PAYMENT, sequence: BigInt(grant.next_sequence), vaultVersion: BigInt(state.version), grantVersion: BigInt(grant.version), evidence: evidence.blobId };
    const tx = buildVaultSpend(request); tx.setGasBudget(GAS); tx.setGasOwner(agent.delegate);
    await prepareVaultSubmission({ intentId: agent.name, request, bytes: await tx.build({ client }), maxGas: GAS, transport: client, journal, sign: (bytes) => store.sign(agent, request, bytes) });
  }
  const recovered = await readJournaledVaultOutcome({ intentId: agent.name, journal, transport: client });
  if (recovered.kind === "failed") throw new Error("A stored payment failed; preserve this run for review");
  const payment = recovered.kind === "confirmed" ? recovered : await submitJournaledVaultPayment({ intentId: agent.name, journal, transport: client });
  console.log(JSON.stringify({ step: `${agent.name}-payment`, ...payment }));
  await new Promise((resolve) => setTimeout(resolve, 2500));
  if (agent.name === "research") await blockedProbe(agent, "daily-limit", "budget", "0");
}
async function blockedProbe(agent: typeof agents[number], label: string, module: string, abortCode: string) {
  const path = resolve(root, `${label}.simulation.json`);
  if (await readOptional(path)) return;
  const state = await readVaultState(client, target);
  const grant = await readVaultGrant(client, target.packageId, state, agent.agent);
  const tx = buildVaultSpend({ ...target, delegate: agent.delegate, agent: agent.agent, recipient: recipient!, amount: 1n, sequence: BigInt(grant.next_sequence), vaultVersion: BigInt(state.version), grantVersion: BigInt(grant.version), evidence: `acceptance:${runId}:${label}` });
  tx.setGasBudget(2_000_000n); tx.setGasOwner(agent.delegate);
  let error: any;
  try {
    const result = await client.simulateTransaction({ transaction: tx, checksEnabled: true, include: { effects: true } });
    const execution = result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;
    if (execution.status.success) throw new Error("Expected Move rejection but simulation succeeded");
    error = execution.status.error;
  } catch (failure) {
    if (!failure || typeof failure !== "object" || !("executionError" in failure)) throw failure;
    error = failure.executionError;
  }
  if (error?.$kind !== "MoveAbort" || error.MoveAbort?.abortCode !== abortCode || error.MoveAbort?.location?.module !== module) throw new Error(`${label}: did not establish the expected Move rejection: ${JSON.stringify(error)}`);
  await durableWrite(path, { submitted: false, module, abortCode, error });
  console.log(JSON.stringify({ step: label, expectedMoveRejection: true, submitted: false }));
}
const research = agents[0]!;
const state = await readVaultState(client, target);
const withdrawalRecorded = !!await readOptional(resolve(root, "withdraw.json"));
if (BigInt(state.spent) !== 2n * PAYMENT || (BigInt(state.funds) !== DEPOSIT - 2n * PAYMENT && !(withdrawalRecorded && state.funds === "0"))) throw new Error("Vault accounting does not match two payments");
await ownerStep("revoke-research", () => buildRevokeVaultAgent({ ...target, agent: research.agent }));
await blockedProbe(research, "revoked-access", "vault", "5");
await ownerStep("withdraw", () => buildWithdrawVault({ ...target, amount: DEPOSIT - 2n * PAYMENT }));
const final = await readVaultState(client, target);
const revoked = await readVaultGrant(client, target.packageId, final, research.agent);
if (final.funds !== "0" || final.spent !== "2000000" || revoked.active) throw new Error("Owner recovery verification failed");
const recipientEnd = BigInt((await client.getBalance({ owner: recipient, coinType: "0x2::sui::SUI" })).balance.balance);
if (recipientEnd - BigInt(recipientStart.balance) !== 2n * PAYMENT) throw new Error("Recipient balance delta does not match the two payments");
const complete = { complete: true, vaultId, totalPaidMist: "2000000", vaultBalanceMist: final.funds, revoked: true, recipientBalanceDeltaMist: (recipientEnd - BigInt(recipientStart.balance)).toString(), note: "Contract, isolated signing and Walrus acceptance only; hosted HTTP and browser onboarding require separate acceptance." };
await durableWrite(resolve(root, "complete.json"), complete);
console.log(JSON.stringify(complete));
