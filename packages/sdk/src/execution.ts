import { hexToBytes } from "@noble/hashes/utils.js";
import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { normalizeSuiAddressStrict } from "./address";
import { decodeStatusError, decodeTransactionResult } from "./decoding";
import { PraxisSdkError } from "./errors";
import type { DeploymentPort, SignerPort, SuiTransport } from "./ports";
import type { AbortReason } from "./types";

const ABORT_REASON_CODE: Record<AbortReason, number> = {
  agent_decision: 0,
  policy_block: 1,
  high_risk: 2,
  sim_failed: 3,
};

export interface ExecuteApprovedSuiSpendInput {
  transport: SuiTransport;
  signer: SignerPort;
  deployment: DeploymentPort;
  agent: string;
  recipient: string;
  amount: bigint;
  coinType: string;
  blobId: string;
  sealPolicyId: string;
  riskScore: number;
  simulationPassed: boolean;
  purposeTag: string;
}

export interface ExecutedSuiSpend {
  digest: string;
  receiptId?: string;
}

/** Build and execute the receipt transaction for an approved spend. */
export async function executeApprovedSuiSpend(input: ExecuteApprovedSuiSpendInput): Promise<ExecutedSuiSpend> {
  const transaction = buildSpendTransaction(input);
  let signed: { bytes: string; signature: string };
  try {
    signed = await input.signer.signTransaction(transaction);
  } catch (cause) {
    throw new PraxisSdkError("TRANSACTION_FAILED", "transaction signing failed", { cause });
  }
  const transactionBytes = decodeBase64(signed.bytes);
  const transactionDigest = TransactionDataBuilder.getDigestFromBytes(transactionBytes);
  let raw: unknown;
  try {
    raw = await input.transport.executeTransaction({
      transaction: transactionBytes,
      signatures: [signed.signature],
      include: { effects: true, objectTypes: true, events: true },
    });
  } catch (cause) {
    throw new PraxisSdkError("TRANSACTION_SUBMISSION_UNKNOWN", "transaction submission status is unknown", { cause, retryable: false, txDigest: transactionDigest });
  }
  let result: ReturnType<typeof decodeTransactionResult>;
  try {
    result = decodeTransactionResult(raw, "execution");
  } catch (cause) {
    throw new PraxisSdkError("TRANSACTION_SUBMISSION_UNKNOWN", "transaction response could not establish the submission outcome", { cause, txDigest: transactionDigest });
  }
  if (!result.status.success) {
    throw new PraxisSdkError("TRANSACTION_FAILED", "approved spend transaction failed", {
      cause: decodeStatusError(result.status),
      txDigest: result.digest,
    });
  }
  let receiptId: string;
  try {
    receiptId = decodeCreatedReceiptId(result.effects, result.objectTypes, `${input.deployment.packageId}::spending_receipt::SpendingReceipt`);
  } catch (cause) {
    throw new PraxisSdkError("TRANSACTION_SUBMISSION_UNKNOWN", "successful transaction response did not contain a verifiable Praxis receipt", { cause, txDigest: transactionDigest });
  }
  return { digest: result.digest, receiptId };
}

export interface RecordBlockedSuiIntentInput {
  transport: SuiTransport;
  signer: SignerPort;
  deployment: DeploymentPort;
  agent: string;
  recipient: string;
  amount: bigint;
  blobId: string;
  reason: AbortReason;
  riskScore: number;
}

/** Record a blocked outcome; a failed audit write never turns it into a spend. */
export async function recordBlockedSuiIntent(input: RecordBlockedSuiIntentInput): Promise<{ digest: string }> {
  const agent = normalize(input.agent);
  const recipient = normalize(input.recipient);
  if (input.amount <= 0n || input.amount > 18_446_744_073_709_551_615n) {
    throw new PraxisSdkError("INVALID_AMOUNT", "amount must be a positive u64 value");
  }
  assertRiskScore(input.riskScore);
  if (!(input.reason in ABORT_REASON_CODE)) {
    throw new PraxisSdkError("CONFIGURATION_ERROR", "abort reason is invalid");
  }
  const transaction = new Transaction();
  transaction.moveCall({
    target: `${input.deployment.packageId}::agent_registry::record_abort`,
    arguments: [
      transaction.object(input.deployment.agentCapId),
      transaction.object(input.deployment.agentIndexId),
      transaction.pure.address(agent),
      transaction.pure.address(recipient),
      transaction.pure.u64(input.amount),
      transaction.pure.vector("u8", utf8Bytes(input.blobId)),
      transaction.pure.u8(ABORT_REASON_CODE[input.reason]),
      transaction.pure.u8(input.riskScore),
      transaction.object(input.deployment.clockId),
    ],
  });
  let signed: { bytes: string; signature: string };
  try {
    signed = await input.signer.signTransaction(transaction);
  } catch (cause) {
    throw new PraxisSdkError("TRANSACTION_FAILED", "blocked-intent recording signature failed", { cause });
  }
  const transactionBytes = decodeBase64(signed.bytes);
  const transactionDigest = TransactionDataBuilder.getDigestFromBytes(transactionBytes);
  let raw: unknown;
  try {
    raw = await input.transport.executeTransaction({ transaction: transactionBytes, signatures: [signed.signature], include: { effects: true } });
  } catch (cause) {
    throw new PraxisSdkError("TRANSACTION_SUBMISSION_UNKNOWN", "blocked-intent recording status is unknown", { cause, txDigest: transactionDigest });
  }
  let result: ReturnType<typeof decodeTransactionResult>;
  try {
    result = decodeTransactionResult(raw, "blocked-intent recording");
  } catch (cause) {
    throw new PraxisSdkError("TRANSACTION_SUBMISSION_UNKNOWN", "blocked-intent response could not establish the submission outcome", { cause, txDigest: transactionDigest });
  }
  if (!result.status.success) {
    throw new PraxisSdkError("TRANSACTION_FAILED", "blocked-intent recording transaction failed", {
      cause: decodeStatusError(result.status),
    });
  }
  return { digest: result.digest };
}

function buildSpendTransaction(input: ExecuteApprovedSuiSpendInput): Transaction {
  const agent = normalize(input.agent);
  const recipient = normalize(input.recipient);
  if (input.coinType !== "0x2::sui::SUI") throw new PraxisSdkError("UNSUPPORTED_COIN", "Phase 1 supports SUI only");
  if (input.amount <= 0n || input.amount > 18_446_744_073_709_551_615n) throw new PraxisSdkError("INVALID_AMOUNT", "amount must be a positive u64 value");
  assertRiskScore(input.riskScore);
  if (!/^[a-f0-9]{64}$/i.test(input.purposeTag)) throw new PraxisSdkError("CONFIGURATION_ERROR", "purpose tag must be a 32-byte hexadecimal value");
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(input.amount)]);
  tx.moveCall({
    target: `${input.deployment.packageId}::spending_receipt::record_spend`,
    typeArguments: [input.coinType],
    arguments: [
      tx.object(input.deployment.agentCapId),
      tx.object(input.deployment.agentIndexId),
      coin,
      tx.pure.address(agent),
      tx.pure.address(recipient),
      tx.pure.vector("u8", utf8Bytes(input.blobId)),
      tx.pure.vector("u8", utf8Bytes(input.sealPolicyId)),
      tx.pure.u8(input.riskScore),
      tx.pure.bool(input.simulationPassed),
      tx.pure.vector("u8", Array.from(hexToBytes(input.purposeTag))),
      tx.object(input.deployment.clockId),
    ],
  });
  return tx;
}

function assertRiskScore(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new PraxisSdkError("CONFIGURATION_ERROR", "risk score must be an integer from 0 through 100");
  }
}

function decodeCreatedReceiptId(
  effects: Record<string, unknown> | undefined,
  objectTypes: Record<string, string> | undefined,
  expectedType: string,
): string {
  if (!effects || !Array.isArray(effects.changedObjects) || !objectTypes) {
    throw new PraxisSdkError("TRANSACTION_RESPONSE_MALFORMED", "successful spend response has no receipt effects");
  }
  const receiptIds = effects.changedObjects
    .filter((value): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value))
    .filter((value) => value.idOperation === "Created" && typeof value.objectId === "string")
    .map((value) => value.objectId as string)
    .filter((objectId) => objectTypes[objectId] === expectedType);
  if (receiptIds.length !== 1) {
    throw new PraxisSdkError("TRANSACTION_RESPONSE_MALFORMED", "successful spend did not create exactly one Praxis receipt");
  }
  return receiptIds[0]!;
}

function normalize(value: string): string {
  try {
    return normalizeSuiAddressStrict(value);
  } catch (cause) {
    throw new PraxisSdkError("INVALID_ADDRESS", "address is not a valid Sui address", { cause });
  }
}

function utf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function decodeBase64(value: string): Uint8Array {
  try {
    if (!value || typeof value !== "string" || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
      throw new Error("missing or malformed bytes");
    }
    if (typeof Buffer !== "undefined") {
      const bytes = new Uint8Array(Buffer.from(value, "base64"));
      if (bytes.byteLength === 0) throw new Error("empty bytes");
      return bytes;
    }
    const decoded = atob(value);
    if (!decoded.length) throw new Error("empty bytes");
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  } catch (cause) {
    throw new PraxisSdkError("TRANSACTION_RESPONSE_MALFORMED", "signed transaction bytes are malformed", { cause });
  }
}
