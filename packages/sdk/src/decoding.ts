import { PraxisSdkError } from "./errors";

export type DecodedTransaction = {
  digest: string;
  status: { success: boolean; error?: unknown };
  effects?: Record<string, unknown>;
  balanceChanges?: Array<Record<string, unknown>>;
  objectTypes?: Record<string, string>;
  events?: Array<Record<string, unknown>>;
};

/** Decode current Sui Core API discriminated results without trusting casts. */
export function decodeTransactionResult(value: unknown, operation: string): DecodedTransaction {
  if (!isRecord(value)) throw malformed(operation);
  const kind = value.$kind;
  const payload = kind === "Transaction" ? value.Transaction : kind === "FailedTransaction" ? value.FailedTransaction : undefined;
  // Keep compatibility with older injected adapters that returned the payload
  // directly, but never accept an arbitrary primitive or missing status.
  const transaction = isRecord(payload) ? payload : kind === undefined && isRecord(value) ? value : undefined;
  if (!transaction || typeof transaction.digest !== "string" || !isRecord(transaction.status)) throw malformed(operation);
  const status = transaction.status;
  if (typeof status.success !== "boolean") throw malformed(operation);
  return {
    digest: transaction.digest,
    status: { success: status.success, error: status.error },
    effects: normalizeRecord(transaction.effects),
    balanceChanges: arrayOfRecords(transaction.balanceChanges),
    objectTypes: isStringRecord(transaction.objectTypes),
    events: arrayOfRecords(transaction.events),
  };
}

export function decodeSimulationResult(value: unknown): DecodedTransaction {
  if (!isRecord(value)) throw malformed("simulation");
  const kind = value.$kind;
  const payload = kind === "Transaction" ? value.Transaction : kind === "FailedTransaction" ? value.FailedTransaction : undefined;
  const transaction = isRecord(payload) ? payload : kind === undefined && isRecord(value) ? value : undefined;
  if (!transaction) throw malformed("simulation");

  // The Core API does not populate Transaction.digest for simulations. It does
  // expose the deterministic transaction digest on the parsed effects object.
  // Normalize only this simulation response shape; execution continues to
  // require the top-level digest so an ambiguous submission fails closed.
  const effectsDigest = isRecord(transaction.effects) ? transaction.effects.transactionDigest : undefined;
  const normalized =
    typeof transaction.digest === "string"
      ? value
      : typeof effectsDigest === "string"
        ? kind === undefined
          ? { ...transaction, digest: effectsDigest }
          : { ...value, [String(kind)]: { ...transaction, digest: effectsDigest } }
        : value;
  const decoded = decodeTransactionResult(normalized, "simulation");
  if (!decoded.balanceChanges) throw malformed("simulation balance changes");
  return decoded;
}

export function decodeStatusError(status: { success: boolean; error?: unknown }): string {
  if (status.success) return "";
  if (isRecord(status.error) && typeof status.error.message === "string") return status.error.message;
  if (typeof status.error === "string") return status.error;
  return "on-chain transaction failed";
}

function malformed(operation: string): PraxisSdkError {
  return new PraxisSdkError("TRANSACTION_RESPONSE_MALFORMED", `malformed ${operation} response`);
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) throw malformed("transaction collection");
  return value as Array<Record<string, unknown>>;
}

function isStringRecord(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string")) throw malformed("transaction object types");
  return value as Record<string, string>;
}

function normalizeRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw malformed("transaction effects");
  const normalized = normalizeJson(value, 0);
  if (!isRecord(normalized)) throw malformed("transaction effects");
  return normalized;
}

function normalizeJson(value: unknown, depth: number): unknown {
  if (depth > 16) throw malformed("transaction effects");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw malformed("transaction effects");
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  // Parsed Core API responses carry BCS alongside their JSON representation.
  // The byte payload is transport data, not normalized audit evidence.
  if (value instanceof Uint8Array) return undefined;
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item, depth + 1) ?? null);
  if (!isRecord(value)) throw malformed("transaction effects");
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "bcs") continue;
    const normalized = normalizeJson(item, depth + 1);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}
