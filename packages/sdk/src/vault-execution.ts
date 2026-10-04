import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { verifyTransactionSignature } from "@mysten/sui/verify";
import { buildVaultSpend, type VaultSpend } from "./vault";
import { normalizeSuiAddressStrict } from "./address";
import { decodeSimulationResult, decodeTransactionResult } from "./decoding";
import { PraxisSdkError } from "./errors";
import type { SuiTransport } from "./ports";

export interface VaultSubmission {
  intentId: string;
  digest: string;
  bytes: string;
  signature: string;
  request: VaultSpend;
  gasBudget: bigint;
}

/** Implementations must durably insert once per intent and reserve the grant's
 * sequence uniquely. Conflicts cannot overwrite an existing signed envelope. */
export interface VaultSubmissionJournal {
  saveOnce(submission: VaultSubmission): Promise<void>;
  load(intentId: string): Promise<VaultSubmission | null>;
}

/** Reject additional calls, mutated arguments and unbounded gas before signing.
 * The caller must obtain request and gas ceiling from trusted assignment config. */
export function validateVaultTransaction(bytes: Uint8Array, request: VaultSpend, maxGas: bigint): void {
  const actual = Transaction.from(bytes).getData();
  const expected = buildVaultSpend(request).getData();
  const delegate = normalizeSuiAddressStrict(request.delegate);
  if (actual.sender !== delegate || actual.gasData.owner !== delegate) throw new Error("Vault sender and gas owner must be the authorized delegate");
  const gas = BigInt(actual.gasData.budget ?? "0");
  if (maxGas <= 0n || gas <= 0n || gas > maxGas) throw new Error("Vault gas budget exceeds authorization");
  if (actual.commands.length !== 1 || actual.inputs.length !== expected.inputs.length) throw new Error("Only one vault spend call is allowed");
  const call = actual.commands[0]?.MoveCall;
  const expectedCall = expected.commands[0]!.MoveCall!;
  if (!call || call.package !== expectedCall.package || call.module !== "vault" || call.function !== "spend" || call.typeArguments.length !== 0 || call.arguments.length !== 9) throw new Error("Unexpected vault transaction target");
  for (let i = 0; i < 9; i += 1) {
    const argument = call.arguments[i];
    if (argument?.$kind !== "Input" || argument.Input !== i) throw new Error("Unexpected vault argument binding");
    if (i === 0 || i === 8) {
      const object = actual.inputs[i]?.Object?.SharedObject;
      const objectId = expected.inputs[i]?.UnresolvedObject?.objectId;
      if (!object || object.objectId !== objectId || object.mutable !== (i === 0)) throw new Error("Unexpected vault or clock object");
    } else if (actual.inputs[i]?.Pure?.bytes !== expected.inputs[i]?.Pure?.bytes) throw new Error("Vault payment arguments changed");
  }
}

/** Build bytes outside this function using the configured network client.
 * Simulates and signs identical bytes; no broadcast occurs until journal write.
 * A simulation pass is not a guarantee that later execution will succeed. */
export async function prepareVaultSubmission(input: {
  intentId: string;
  request: VaultSpend;
  bytes: Uint8Array;
  maxGas: bigint;
  transport: SuiTransport;
  sign: (bytes: Uint8Array) => Promise<string>;
  journal: VaultSubmissionJournal;
}): Promise<VaultSubmission> {
  if (!input.intentId) throw new Error("An intent ID is required");
  if (await input.journal.load(input.intentId)) throw new Error("Intent already has a signed submission; reconcile it instead");
  const bytes = Uint8Array.from(input.bytes);
  validateVaultTransaction(bytes, input.request, input.maxGas);
  const simulated = decodeSimulationResult(await input.transport.simulateTransaction({ transaction: bytes, checksEnabled: true, include: { effects: true, balanceChanges: true } }));
  if (!simulated.status.success) throw new PraxisSdkError("SIMULATION_FAILED", "Vault execution simulation failed");
  const signature = await input.sign(Uint8Array.from(bytes));
  const key = await verifyTransactionSignature(bytes, signature);
  if (key.toSuiAddress() !== normalizeSuiAddressStrict(input.request.delegate)) throw new Error("Signature is not from the authorized delegate");
  const submission: VaultSubmission = {
    intentId: input.intentId, digest: TransactionDataBuilder.getDigestFromBytes(bytes),
    bytes: Buffer.from(bytes).toString("base64"), signature,
    request: { ...input.request }, gasBudget: input.maxGas,
  };
  await input.journal.saveOnce(submission);
  return submission;
}

/** Always load the immutable journal entry. Lost replies retry identical bytes,
 * never a new payment sequence. Caller owns reconciliation and terminal state. */
export async function submitJournaledVaultPayment(input: { intentId: string; journal: VaultSubmissionJournal; transport: SuiTransport }): Promise<{ digest: string; receiptId: string }> {
  const row = await input.journal.load(input.intentId);
  if (!row || row.intentId !== input.intentId) throw new Error("No durable signed submission exists");
  const bytes = Uint8Array.from(Buffer.from(row.bytes, "base64"));
  validateVaultTransaction(bytes, row.request, row.gasBudget);
  const digest = TransactionDataBuilder.getDigestFromBytes(bytes);
  if (digest !== row.digest) throw new Error("Stored transaction digest mismatch");
  const key = await verifyTransactionSignature(bytes, row.signature);
  if (key.toSuiAddress() !== normalizeSuiAddressStrict(row.request.delegate)) throw new Error("Stored signature mismatch");
  let result;
  try {
    const raw = await input.transport.executeTransaction({ transaction: bytes, signatures: [row.signature], include: { effects: true, objectTypes: true, events: true } });
    result = decodeTransactionResult(raw, "vault execution");
    if (result.digest !== digest) throw new Error("Unexpected execution digest");
  } catch (cause) {
    throw new PraxisSdkError("TRANSACTION_SUBMISSION_UNKNOWN", "Reconcile the stored vault transaction before any new attempt", { cause, txDigest: digest });
  }
  if (!result.status.success) throw new PraxisSdkError("TRANSACTION_FAILED", "Vault transaction failed on-chain", { txDigest: digest });
  const expectedType = `${normalizeSuiAddressStrict(row.request.packageId)}::vault::Receipt`;
  const created = result.effects?.changedObjects;
  const receipts = Array.isArray(created) ? created.filter((object) => object?.idOperation === "Created" && result.objectTypes?.[object.objectId] === expectedType) : [];
  if (receipts.length !== 1 || typeof receipts[0].objectId !== "string") throw new PraxisSdkError("TRANSACTION_SUBMISSION_UNKNOWN", "Vault receipt could not be established", { txDigest: digest });
  return { digest, receiptId: receipts[0].objectId };
}
