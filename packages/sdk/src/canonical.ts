import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { PraxisSdkError } from "./errors";

const BIGINT_TAG = "$praxis_bigint";

/** Deterministic JSON with distinct, exact BigInt values and no silent coercion. */
export function canonicalize(value: unknown): string {
  const encoded = JSON.stringify(sortDeep(value, new Set<object>()));
  if (encoded === undefined) throw new PraxisSdkError("CONFIGURATION_ERROR", "canonical data must be JSON");
  return encoded;
}

function sortDeep(v: unknown, active: Set<object>): unknown {
  // BigInts are tagged so 1n cannot hash as the same value as the string "1".
  // The reserved key is rejected for caller objects below, so the encoding is
  // unambiguous while remaining valid JSON.
  if (typeof v === "bigint") return { [BIGINT_TAG]: v.toString() };
  if (v === null || typeof v === "boolean" || typeof v === "string") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new PraxisSdkError("CONFIGURATION_ERROR", "canonical data contains a non-finite number");
    return v;
  }
  if (Array.isArray(v)) {
    if (active.has(v)) throw new PraxisSdkError("CONFIGURATION_ERROR", "canonical data cannot be circular");
    active.add(v);
    const result = v.map((item, index) => {
      if (!(index in v)) throw new PraxisSdkError("CONFIGURATION_ERROR", "canonical arrays cannot contain holes");
      return sortDeep(item, active);
    });
    active.delete(v);
    return result;
  }
  if (v && typeof v === "object") {
    if (active.has(v)) throw new PraxisSdkError("CONFIGURATION_ERROR", "canonical data cannot be circular");
    const prototype = Object.getPrototypeOf(v);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new PraxisSdkError("CONFIGURATION_ERROR", "canonical data must contain plain JSON objects");
    }
    active.add(v);
    const obj = v as Record<string, unknown>;
    const result = Object.keys(obj)
      .sort()
      .map((key) => {
        if (key === "__proto__" || key === "prototype" || key === "constructor" || key === BIGINT_TAG) {
          throw new PraxisSdkError("CONFIGURATION_ERROR", `canonical data contains forbidden key: ${key}`);
        }
        return [key, sortDeep(obj[key], active)] as const;
      })
      .reduce<Record<string, unknown>>((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, Object.create(null));
    active.delete(v);
    return result;
  }
  throw new PraxisSdkError("CONFIGURATION_ERROR", "canonical data must contain JSON values");
}

export function blake3Hex(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return bytesToHex(blake3(bytes));
}

/** Stable on-chain replay key. It deliberately excludes wall-clock time. */
export function stablePurposeTag(input: {
  organizationId: string;
  assignmentId: string;
  idempotencyKey: string;
  requestHash: string;
}): string {
  return blake3Hex(canonicalize({ v: 1, ...input }));
}
