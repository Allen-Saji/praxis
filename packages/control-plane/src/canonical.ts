import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { DomainError } from "./errors";
import { normalizeSuiAddress } from "./validation";

/** The wrapper keeps 1n and the string "1" distinct in request hashes. */
export const BIGINT_TAG = "$praxis_bigint";
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor", BIGINT_TAG]);
const U64_MAX = 18_446_744_073_709_551_615n;

function fail(cause?: unknown): never {
  throw new DomainError("INVALID_CANONICAL_VALUE", undefined, cause === undefined ? undefined : { cause });
}

function canonicalValue(value: unknown, stack: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "bigint") return `{${JSON.stringify(BIGINT_TAG)}:${JSON.stringify(value.toString(10))}}`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail();
    // JSON.stringify is defined to return a string for every finite number.
    return JSON.stringify(value) as string;
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") fail();
  if (stack.has(value)) fail();
  stack.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) fail();
      for (const key of Object.getOwnPropertyNames(value)) {
        if (key === "length") continue;
        if (FORBIDDEN_KEYS.has(key) || !/^(0|[1-9][0-9]*)$/.test(key) || !Object.prototype.propertyIsEnumerable.call(value, key)) fail();
      }
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) fail();
        items.push(canonicalValue(value[index], stack));
      }
      return `[${items.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail();
    if (Object.getOwnPropertySymbols(value).length > 0) fail();
    const record = value as Record<string, unknown>;
    for (const key of Object.getOwnPropertyNames(record)) {
      if (FORBIDDEN_KEYS.has(key) || !Object.prototype.propertyIsEnumerable.call(record, key)) fail();
    }
    const keys = Object.keys(record);
    for (const key of keys) if (FORBIDDEN_KEYS.has(key)) fail();
    keys.sort();
    const fields: string[] = [];
    for (const key of keys) {
      let field: unknown;
      try {
        field = record[key];
      } catch (error) {
        fail(error);
      }
      fields.push(`${JSON.stringify(key)}:${canonicalValue(field, stack)}`);
    }
    return `{${fields.join(",")}}`;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    fail(error);
  } finally {
    stack.delete(value);
  }
}

/** Return deterministic JSON without invoking JSON.stringify's lossy rules. */
export function canonicalJson(value: unknown): string {
  return canonicalValue(value, new Set<object>());
}

export const canonicalize = canonicalJson;

export function hashCanonical(value: unknown): string {
  return bytesToHex(blake3(utf8ToBytes(canonicalJson(value))));
}

export function purposeTag(input: { organizationId: string; assignmentId: string; idempotencyKey: string; requestHash: string }): string {
  return hashCanonical({
    v: 1,
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
  });
}

export const stablePurposeTag = purposeTag;

export type PolicyRuleDocument = { recipient: string; effect: "allow" | "deny" };

export type CanonicalPolicyDocument = {
  maxPerTxMist: string;
  maxPerDayMist: string;
  maxPerMonthMist: string;
  blockRiskScoreAt: number;
  requireSimulation: true;
  rules: PolicyRuleDocument[];
};

type PolicyDocumentInput = {
  maxPerTxMist: bigint | string;
  maxPerDayMist: bigint | string;
  maxPerMonthMist: bigint | string;
  blockRiskScoreAt: number;
  requireSimulation: boolean;
  rules?: readonly PolicyRuleDocument[];
  allowlist?: readonly string[];
  denylist?: readonly string[];
  allowedRecipients?: readonly string[];
  deniedRecipients?: readonly string[];
};

function decimalString(value: bigint | string): string {
  if (typeof value === "bigint") {
    if (value < 0n || value > U64_MAX) throw new DomainError("INVALID_POLICY", "policy limits must fit in u64");
    return value.toString(10);
  }
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new DomainError("INVALID_POLICY", "policy limits must be decimal strings");
  }
  if (BigInt(value) > U64_MAX) throw new DomainError("INVALID_POLICY", "policy limits must fit in u64");
  return value;
}

/**
 * Convert policy values to the persisted form.  Decimal strings are required
 * in this document so JSON round-trips do not silently turn money into a
 * Number.
 */
export function toCanonicalPolicyDocument(input: PolicyDocumentInput): CanonicalPolicyDocument {
  if (!input) throw new DomainError("INVALID_POLICY", "policy is required");
  for (const list of [input.rules, input.allowlist, input.denylist, input.allowedRecipients, input.deniedRecipients]) {
    if (list !== undefined && !Array.isArray(list)) throw new DomainError("INVALID_POLICY", "policy lists are invalid");
  }
  const inputRules = input.rules ?? [
    ...(input.allowlist ?? input.allowedRecipients ?? []).map((recipient) => ({ recipient, effect: "allow" as const })),
    ...(input.denylist ?? input.deniedRecipients ?? []).map((recipient) => ({ recipient, effect: "deny" as const })),
  ];
  if (!Array.isArray(inputRules)) throw new DomainError("INVALID_POLICY", "policy rules are required");
  if (!Number.isInteger(input.blockRiskScoreAt) || input.blockRiskScoreAt < 1 || input.blockRiskScoreAt > 100) {
    throw new DomainError("INVALID_POLICY", "risk threshold must be 1 through 100");
  }
  if (input.requireSimulation !== true) throw new DomainError("INVALID_POLICY", "simulation is required in Phase 1");
  const rules = inputRules.map((rule) => {
    if (!rule || (rule.effect !== "allow" && rule.effect !== "deny") || typeof rule.recipient !== "string") {
      throw new DomainError("INVALID_POLICY", "recipient rule is invalid");
    }
    return { recipient: normalizeSuiAddress(rule.recipient), effect: rule.effect };
  });
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.recipient)) throw new DomainError("INVALID_POLICY", "recipient rules must be unique after normalization");
    seen.add(rule.recipient);
  }
  rules.sort((left, right) => {
    if (left.recipient < right.recipient) return -1;
    // Duplicate normalized recipients were rejected above, so equality is
    // unreachable here and must not become an accidental ordering branch.
    return 1;
  });
  return {
    maxPerTxMist: decimalString(input.maxPerTxMist),
    maxPerDayMist: decimalString(input.maxPerDayMist),
    maxPerMonthMist: decimalString(input.maxPerMonthMist),
    blockRiskScoreAt: input.blockRiskScoreAt,
    requireSimulation: true,
    rules,
  };
}

export function canonicalPolicyJson(input: PolicyDocumentInput): string {
  return canonicalJson(toCanonicalPolicyDocument(input));
}

export function hashPolicy(input: PolicyDocumentInput): string {
  return hashCanonical(toCanonicalPolicyDocument(input));
}
