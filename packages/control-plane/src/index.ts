import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { normalizeSuiAddress } from "@mysten/sui/utils";

export const SUI_TYPE = "0x2::sui::SUI";
export const U64_MAX = 18_446_744_073_709_551_615n;

export class DomainError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export * from "./auth";

export function parseMist(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new DomainError("INVALID_AMOUNT", "amount must be a canonical unsigned decimal");
  const amount = BigInt(value);
  if (amount === 0n) throw new DomainError("INVALID_AMOUNT", "amount must be positive");
  if (amount > U64_MAX) throw new DomainError("INVALID_AMOUNT", "amount exceeds u64");
  return amount;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new DomainError("INVALID_CANONICAL_VALUE", "non-finite number"); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new DomainError("INVALID_CANONICAL_VALUE", "canonical data must be JSON");
}

export function hashCanonical(value: unknown): string { return bytesToHex(blake3(utf8ToBytes(canonicalJson(value)))); }

export type RecipientRule = { recipient: string; effect: "allow" | "deny" };
export type Policy = {
  maxPerTxMist: bigint; maxPerDayMist: bigint; maxPerMonthMist: bigint;
  blockRiskScoreAt: number; requireSimulation: boolean; rules: RecipientRule[];
};

export function validatePolicy(policy: Policy): Policy {
  if (policy.maxPerTxMist <= 0n || policy.maxPerDayMist < policy.maxPerTxMist || policy.maxPerMonthMist < policy.maxPerDayMist) throw new DomainError("INVALID_POLICY", "policy limits must be positive and ordered");
  if (!Number.isInteger(policy.blockRiskScoreAt) || policy.blockRiskScoreAt < 1 || policy.blockRiskScoreAt > 100) throw new DomainError("INVALID_POLICY", "risk threshold must be 1 through 100");
  if (!policy.requireSimulation) throw new DomainError("INVALID_POLICY", "simulation is required in Phase 1");
  const seen = new Set<string>();
  const rules = policy.rules.map((rule) => {
    const recipient = normalizeAddress(rule.recipient);
    if (rule.effect !== "allow" && rule.effect !== "deny") throw new DomainError("INVALID_POLICY", "recipient rule effect is invalid");
    if (seen.has(recipient)) throw new DomainError("INVALID_POLICY", "recipient may appear only once");
    seen.add(recipient); return { recipient, effect: rule.effect };
  });
  return { ...policy, rules };
}

export function evaluatePolicies(wallet: Policy, assignment: Policy, recipient: string, amount: bigint): { allowed: boolean; code?: string; effectiveRiskScore: number } {
  const normalized = normalizeAddress(recipient);
  const policies = [validatePolicy(wallet), validatePolicy(assignment)];
  for (const policy of policies) {
    if (amount > policy.maxPerTxMist) return { allowed: false, code: "OVER_TX_LIMIT", effectiveRiskScore: Math.min(wallet.blockRiskScoreAt, assignment.blockRiskScoreAt) };
    const allow = policy.rules.filter((rule) => rule.effect === "allow").map((rule) => rule.recipient);
    if (policy.rules.some((rule) => rule.effect === "deny" && rule.recipient === normalized)) return { allowed: false, code: "BLOCKED_RECIPIENT", effectiveRiskScore: Math.min(wallet.blockRiskScoreAt, assignment.blockRiskScoreAt) };
    if (allow.length > 0 && !allow.includes(normalized)) return { allowed: false, code: "RECIPIENT_NOT_ALLOWED", effectiveRiskScore: Math.min(wallet.blockRiskScoreAt, assignment.blockRiskScoreAt) };
  }
  return { allowed: true, effectiveRiskScore: Math.min(wallet.blockRiskScoreAt, assignment.blockRiskScoreAt) };
}

export type IntentState = "received" | "policy_blocked" | "reserved" | "simulating" | "simulation_blocked" | "evidence_pending" | "evidence_published" | "signing" | "submitted" | "submission_unknown" | "confirmed" | "abort_record_pending" | "blocked" | "failed" | "expired";
const TRANSITIONS: Record<IntentState, readonly IntentState[]> = {
  received:["policy_blocked","reserved","failed"], policy_blocked:["evidence_pending"], reserved:["simulating","expired"], simulating:["simulation_blocked","evidence_pending","failed"], simulation_blocked:["evidence_pending"], evidence_pending:["evidence_published","failed"], evidence_published:["signing","abort_record_pending"], signing:["submitted","failed","submission_unknown"], submitted:["confirmed","submission_unknown","failed"], submission_unknown:["submitted","confirmed","failed"], abort_record_pending:["blocked"], confirmed:[], blocked:[], failed:[], expired:[] };
export function transitionIntent(current: IntentState, next: IntentState): IntentState { if (!TRANSITIONS[current].includes(next)) throw new DomainError("INVALID_INTENT_TRANSITION", `${current} cannot transition to ${next}`); return next; }
export function utcPeriods(at: Date): { day: Date; month: Date } { return { day: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())), month: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)) }; }
export function purposeTag(input: { organizationId: string; assignmentId: string; idempotencyKey: string; requestHash: string }): string { return hashCanonical({ v: 1, ...input }); }
function normalizeAddress(value: string): string { try { return normalizeSuiAddress(value.trim()); } catch { throw new DomainError("INVALID_ADDRESS", "recipient must be a valid Sui address"); } }
