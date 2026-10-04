import { simulateVaultPayment } from "./vault-simulation";
import { describe, expect, it, vi } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { buildVaultSpend } from "./vault";
import { prepareVaultSubmission, readJournaledVaultOutcome, submitJournaledVaultPayment, validateVaultTransaction, type VaultSubmission, type VaultSubmissionJournal } from "./vault-execution";
import type { SuiTransport } from "./ports";

const address = (digit: string) => `0x${digit.repeat(64)}`;
const key = Ed25519Keypair.generate();
const request = { packageId: address("1"), vaultId: address("2"), delegate: key.toSuiAddress(), agent: address("3"), recipient: address("4"), amount: 42n, sequence: 0n, vaultVersion: 0n, grantVersion: 0n, evidence: "walrus-reference" };
async function bytes(mutate?: (tx: Transaction) => void) {
  const tx = buildVaultSpend(request);
  tx.setGasOwner(request.delegate);
  tx.setGasBudget(1000n);
  tx.setGasPrice(1);
  tx.setGasPayment([{ objectId: address("5"), version: "1", digest: "11111111111111111111111111111111" }]);
  mutate?.(tx);
  const data = new TransactionDataBuilder(tx.getData());
  for (const i of [0, 8]) {
    const objectId = data.inputs[i]!.UnresolvedObject!.objectId;
    data.inputs[i] = { $kind: "Object", Object: { $kind: "SharedObject", SharedObject: { objectId, initialSharedVersion: "1", mutable: i === 0 } } };
  }
  return data.build();
}
function fixtures() {
  let row: VaultSubmission | null = null;
  const journal: VaultSubmissionJournal = {
    load: vi.fn(async () => row),
    saveOnce: vi.fn(async (value) => { if (row) throw new Error("conflict"); row = value; }),
  };
  const transport: SuiTransport = {
    simulateTransaction: vi.fn(async () => ({ digest: "simulation", balanceChanges: [], status: { success: true } })),
    executeTransaction: vi.fn(async () => ({ digest: row!.digest, status: { success: true }, effects: { changedObjects: [{ objectId: address("6"), idOperation: "Created" }] }, objectTypes: { [address("6")]: `${request.packageId}::vault::Receipt` } })),
    getBalance: vi.fn(), getObject: vi.fn(),
  };
  const sign = vi.fn(async (data: Uint8Array) => (await key.signTransaction(data)).signature);
  return { journal, transport, sign };
}

describe("durable vault submission", () => {
  it("reconciles a lost response from chain evidence without broadcasting", async () => {
    const f = fixtures();
    const row = await prepareVaultSubmission({ ...f, intentId: "intent", request, bytes: await bytes(), maxGas: 1000n });
    f.transport.getTransaction = async () => ({ digest: row.digest, status: { success: true }, effects: { changedObjects: [{ idOperation: "Created", objectId: address("6") }] }, objectTypes: { [address("6")]: `${request.packageId}::vault::Receipt` } });
    expect(await readJournaledVaultOutcome({ ...f, intentId: "intent" })).toEqual({ kind: "confirmed", digest: row.digest, receiptId: address("6") });
    expect(f.transport.executeTransaction).not.toHaveBeenCalled();
    f.transport.getTransaction = async () => { throw new Error("not found or RPC unavailable"); };
    expect(await readJournaledVaultOutcome({ ...f, intentId: "intent" })).toEqual({ kind: "unknown", digest: row.digest });
    f.transport.getTransaction = async () => ({ digest: row.digest, status: { success: false } });
    expect(await readJournaledVaultOutcome({ ...f, intentId: "intent" })).toEqual({ kind: "failed", digest: row.digest });
  });
  it("scores principal drain against vault funds without fabricating audit balance changes", async () => {
    const f = fixtures();
    const changes = [{ address: request.recipient, coinType: "0x2::sui::SUI", amount: "42" }];
    f.transport.simulateTransaction = async () => ({ digest: "sim", status: { success: true }, balanceChanges: changes, effects: { gasUsed: { computationCost: "1", storageCost: "0", storageRebate: "0" } } });
    const report = await simulateVaultPayment({ transport: f.transport, bytes: await bytes(), request, maxGas: 1000n, vaultBalance: 50n, daySpent: 0n });
    expect(report.walletBalance).toBe(50n);
    expect(report.risks.some((risk) => risk.code === "DRAIN_DETECTED")).toBe(true);
    expect(report.balanceChanges).toEqual([{ owner: request.recipient, coinType: "0x2::sui::SUI", amount: "42" }]);
  });
  it("rejects extra commands, altered amount and excessive gas before signing", async () => {
    const data = await bytes();
    expect(() => validateVaultTransaction(data, request, 1000n)).not.toThrow();
    expect(() => validateVaultTransaction(data, { ...request, amount: 43n }, 1000n)).toThrow();
    expect(() => validateVaultTransaction(data, request, 999n)).toThrow();
    const extra = await bytes((tx) => { tx.transferObjects([tx.gas], address("7")); });
    expect(() => validateVaultTransaction(extra, request, 1000n)).toThrow();
  });

  it("persists before broadcast and sends identical bytes on retry", async () => {
    const f = fixtures();
    const data = await bytes();
    const row = await prepareVaultSubmission({ ...f, intentId: "intent", request, bytes: data, maxGas: 1000n });
    expect(f.transport.executeTransaction).not.toHaveBeenCalled();
    expect(f.journal.saveOnce).toHaveBeenCalledOnce();
    const result = await submitJournaledVaultPayment({ ...f, intentId: "intent" });
    expect(result).toEqual({ digest: row.digest, receiptId: address("6") });
    await submitJournaledVaultPayment({ ...f, intentId: "intent" });
    expect(f.transport.executeTransaction).toHaveBeenNthCalledWith(2, expect.objectContaining({ transaction: data }));
    expect(f.sign).toHaveBeenCalledOnce();
    await expect(prepareVaultSubmission({ ...f, intentId: "intent", request, bytes: data, maxGas: 1000n })).rejects.toThrow("already");
  });

  it("does not broadcast when durable storage fails", async () => {
    const f = fixtures();
    f.journal.saveOnce = async () => { throw new Error("database unavailable"); };
    await expect(prepareVaultSubmission({ ...f, intentId: "intent", request, bytes: await bytes(), maxGas: 1000n })).rejects.toThrow("database unavailable");
    expect(f.transport.executeTransaction).not.toHaveBeenCalled();
    await expect(submitJournaledVaultPayment({ ...f, intentId: "intent" })).rejects.toThrow("No durable");
  });

  it("retains the original digest after a network timeout", async () => {
    const f = fixtures();
    const row = await prepareVaultSubmission({ ...f, intentId: "intent", request, bytes: await bytes(), maxGas: 1000n });
    f.transport.executeTransaction = async () => { throw new Error("timeout after submission"); };
    await expect(submitJournaledVaultPayment({ ...f, intentId: "intent" })).rejects.toMatchObject({ code: "TRANSACTION_SUBMISSION_UNKNOWN", txDigest: row.digest });
    expect((await f.journal.load("intent"))?.digest).toBe(row.digest);
  });

  it("does not sign failed simulations or persist a wrong delegate signature", async () => {
    const f = fixtures();
    f.transport.simulateTransaction = async () => ({ digest: "sim", balanceChanges: [], status: { success: false } });
    await expect(prepareVaultSubmission({ ...f, intentId: "intent", request, bytes: await bytes(), maxGas: 1000n })).rejects.toMatchObject({ code: "SIMULATION_FAILED" });
    expect(f.sign).not.toHaveBeenCalled();
    const other = fixtures();
    other.sign = vi.fn(async (data: Uint8Array) => (await Ed25519Keypair.generate().signTransaction(data)).signature);
    await expect(prepareVaultSubmission({ ...other, intentId: "intent", request, bytes: await bytes(), maxGas: 1000n })).rejects.toThrow("authorized delegate");
    expect(other.journal.saveOnce).not.toHaveBeenCalled();
  });
});
