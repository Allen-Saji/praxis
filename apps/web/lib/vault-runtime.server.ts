import "server-only";
import { createHash } from "node:crypto";
import { buildVaultSpend, PraxisSdkError, makeSuiClient, prepareVaultSubmission, readJournaledVaultOutcome, readSuiClock, readVaultGrant, readVaultState, simulateVaultPayment, submitJournaledVaultPayment, type NormalizedSimulationReport, type VaultSpend } from "@allen-saji/praxis";
import type { SpendingPolicy } from "@allen-saji/praxis";
import { HttpError } from "./control-plane.server";
import { makeVaultJournal } from "./vault-journal.server";
import { vaultDelegateAddress, signVaultPayment } from "./vault-signer.server";
import { vaultPackageId } from "./vault-config.server";

export interface VaultExecutionBinding { organizationId: string; assignmentId: string; agentId: string; vaultId: string; owner: string; packageId: string }
export interface VaultPaymentIntent { id: string; recipient: string; amountMist: string; evidenceBlobId: string | null }

/** Configured execution adapter. Call only after authenticated identity,
 * database reservations and wallet execution leases have been resolved.
 * Public execution is enabled only by the deployment feature flag. */
export function createVaultExecutionAdapter(binding: VaultExecutionBinding) {
  const packageId = vaultPackageId();
  if (binding.packageId !== packageId) throw new HttpError(503, "VAULT_PACKAGE_MISMATCH", "Vault deployment is not supported.");
  const gas = process.env.PRAXIS_VAULT_MAX_GAS_MIST;
  if (!gas || !/^[1-9][0-9]{0,19}$/.test(gas) || BigInt(gas) > 18_446_744_073_709_551_615n) throw new HttpError(503, "VAULT_GAS_UNCONFIGURED", "Vault transaction gas budget is not configured.");
  const maxGas = BigInt(gas);
  const client = makeSuiClient("testnet");
  const journal = makeVaultJournal(binding.organizationId);
  const agent = `0x${createHash("sha256").update(binding.agentId).digest("hex")}`;
  const scope = { organizationId: binding.organizationId, assignmentId: binding.assignmentId, packageId, vaultId: binding.vaultId, agent };

  async function inspect(intent: VaultPaymentIntent, evidence: string, policy?: SpendingPolicy) {
    const vault = await readVaultState(client, scope);
    if (vault.owner !== binding.owner) throw new Error("Vault owner changed");
    const grant = await readVaultGrant(client, packageId, vault, agent);
    const delegate = await vaultDelegateAddress(scope);
    if (delegate !== grant.delegate) throw new Error("Signer does not match the owner-authorized delegate");
    const now = await readSuiClock(client);
    if (vault.paused || !grant.active || now >= BigInt(grant.expires_ms)) throw new Error("Vault delegation is paused, revoked or expired");
    const request: VaultSpend = { packageId, vaultId: binding.vaultId, delegate, agent, recipient: intent.recipient, amount: BigInt(intent.amountMist), sequence: BigInt(grant.next_sequence), vaultVersion: BigInt(vault.version), grantVersion: BigInt(grant.version), evidence };
    const tx = buildVaultSpend(request); tx.setGasBudget(maxGas); tx.setGasOwner(delegate);
    const bytes = await tx.build({ client });
    const daySpent = BigInt(grant.budget.day) === now / 86_400_000n ? BigInt(grant.budget.daily_spent) : 0n;
    const report = await simulateVaultPayment({ transport: client, bytes, request, maxGas, vaultBalance: BigInt(vault.funds), daySpent, policy });
    return { bytes, request, report };
  }

  return {
    transport: client,
    async recover(intentId: string) { return readJournaledVaultOutcome({ intentId, journal, transport: client }); },
    async simulate(intent: VaultPaymentIntent, policy?: SpendingPolicy): Promise<NormalizedSimulationReport> {
      return (await inspect(intent, "praxis-advisory-preview", policy)).report;
    },
    async execute(intent: VaultPaymentIntent, policy?: SpendingPolicy): Promise<{ digest: string; receiptId: string }> {
      if (!intent.evidenceBlobId) throw new Error("Verified evidence is required before signing");
      try {
      const existing = await journal.load(intent.id);
      if (existing) {
        if (existing.request.vaultId !== binding.vaultId || existing.request.agent !== agent || existing.request.recipient !== intent.recipient || existing.request.amount !== BigInt(intent.amountMist) || existing.request.evidence !== intent.evidenceBlobId) throw new Error("Journal does not match the authorized intent");
      } else {
        const inspected = await inspect(intent, intent.evidenceBlobId, policy);
        if (!inspected.report.success || inspected.report.recommendation !== "proceed") throw new Error("Vault payment requires a passing risk report before signing");
        await prepareVaultSubmission({ intentId: intent.id, request: inspected.request, bytes: inspected.bytes, maxGas, transport: client, journal, sign: (bytes) => signVaultPayment(scope, inspected.request, bytes) });
      }
      return await submitJournaledVaultPayment({ intentId: intent.id, journal, transport: client });
      } catch (error) {
        if (error instanceof PraxisSdkError && error.code === "TRANSACTION_FAILED" && error.txDigest) throw error;
        let saved;
        try { saved = await journal.load(intent.id); }
        catch (lookupError) { throw new PraxisSdkError("TRANSACTION_SUBMISSION_UNKNOWN", "The signing journal is unavailable; retain the reservation until reconciliation", { cause: lookupError }); }
        if (saved) throw new PraxisSdkError("TRANSACTION_SUBMISSION_UNKNOWN", "A signed vault transaction must be reconciled before releasing its reservation", { cause: error, txDigest: saved.digest });
        throw error;
      }
    },
  };
}
