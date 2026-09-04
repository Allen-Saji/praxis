import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { DbDomainError } from "./errors";

const U64_MAX = 18_446_744_073_709_551_615n;
const BIGINT_TAG = "$praxis_bigint";
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor", BIGINT_TAG]);

function invalid(cause?: unknown): never {
  throw new DbDomainError("INVALID_CANONICAL_VALUE", "value cannot be canonicalized", cause);
}

function valueToJson(value: unknown, stack: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "bigint") return `{${JSON.stringify(BIGINT_TAG)}:${JSON.stringify(value.toString(10))}}`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid();
    return JSON.stringify(value) as string;
  }
  if (typeof value !== "object" || value === undefined) invalid();
  if (stack.has(value)) invalid();
  stack.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) invalid();
      const keys = Object.getOwnPropertyNames(value).filter((key) => key !== "length");
      if (keys.some((key) => !/^(0|[1-9][0-9]*)$/.test(key) || FORBIDDEN.has(key) || !Object.prototype.propertyIsEnumerable.call(value, key))) invalid();
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
        items.push(valueToJson(value[index], stack));
      }
      return `[${items.join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    if (Object.getOwnPropertySymbols(value).length > 0) invalid();
    const record = value as Record<string, unknown>;
    const keys = Object.getOwnPropertyNames(record);
    if (keys.some((key) => FORBIDDEN.has(key) || !Object.prototype.propertyIsEnumerable.call(record, key))) invalid();
    keys.sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${valueToJson(record[key], stack)}`).join(",")}}`;
  } catch (error) {
    if (error instanceof DbDomainError) throw error;
    invalid(error);
  } finally {
    stack.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return valueToJson(value, new Set<object>());
}

export function hashCanonical(value: unknown): string {
  return bytesToHex(blake3(utf8ToBytes(canonicalJson(value))));
}

export function normalizeSuiAddress(address: string): string {
  if (typeof address !== "string" || !/^0x[0-9a-f]{1,64}$/i.test(address.trim())) {
    throw new DbDomainError("INVALID_ADDRESS", "address is invalid");
  }
  return `0x${address.trim().slice(2).toLowerCase().padStart(64, "0")}`;
}

function decimal(value: string | bigint): string {
  if (typeof value === "bigint") {
    if (value < 0n || value > U64_MAX) throw new DbDomainError("INVALID_POLICY", "policy limit is outside u64");
    return value.toString(10);
  }
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new DbDomainError("INVALID_POLICY", "policy limits must be decimal strings");
  if (BigInt(value) > U64_MAX) throw new DbDomainError("INVALID_POLICY", "policy limit is outside u64");
  return value;
}

export type PolicyRule = { recipient: string; effect: "allow" | "deny" };
export type CanonicalPolicy = { maxPerTxMist: string; maxPerDayMist: string; maxPerMonthMist: string; blockRiskScoreAt: number; requireSimulation: true; rules: PolicyRule[] };

export function toCanonicalPolicy(input: { maxPerTxMist: string | bigint; maxPerDayMist: string | bigint; maxPerMonthMist: string | bigint; blockRiskScoreAt: number; requireSimulation: boolean; rules?: readonly PolicyRule[] }): CanonicalPolicy {
  if (!input || input.requireSimulation !== true || !Number.isInteger(input.blockRiskScoreAt) || input.blockRiskScoreAt < 1 || input.blockRiskScoreAt > 100) throw new DbDomainError("INVALID_POLICY", "policy configuration is invalid");
  const maxPerTxMist = decimal(input.maxPerTxMist);
  const maxPerDayMist = decimal(input.maxPerDayMist);
  const maxPerMonthMist = decimal(input.maxPerMonthMist);
  if (BigInt(maxPerTxMist) <= 0n || BigInt(maxPerDayMist) < BigInt(maxPerTxMist) || BigInt(maxPerMonthMist) < BigInt(maxPerDayMist)) throw new DbDomainError("INVALID_POLICY", "policy limits are not ordered");
  const rules = (input.rules ?? []).map((rule) => ({ recipient: normalizeSuiAddress(rule.recipient), effect: rule.effect }));
  const seen = new Set<string>();
  for (const rule of rules) {
    if (rule.effect !== "allow" && rule.effect !== "deny") throw new DbDomainError("INVALID_POLICY", "policy rule effect is invalid");
    if (seen.has(rule.recipient)) throw new DbDomainError("INVALID_POLICY", "policy recipients must be unique");
    seen.add(rule.recipient);
  }
  rules.sort((left, right) => left.recipient < right.recipient ? -1 : 1);
  return { maxPerTxMist, maxPerDayMist, maxPerMonthMist, blockRiskScoreAt: input.blockRiskScoreAt, requireSimulation: true, rules };
}
