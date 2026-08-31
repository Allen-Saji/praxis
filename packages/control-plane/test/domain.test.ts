import { describe, expect, it } from "vitest";
import { DomainError, U64_MAX, evaluatePolicies, parseMist, purposeTag, transitionIntent, utcPeriods, validatePolicy } from "../src";
const A = "0x1"; const B = "0x2";
const policy = (rules = []) => ({ maxPerTxMist: 10n, maxPerDayMist: 20n, maxPerMonthMist: 30n, blockRiskScoreAt: 80, requireSimulation: true, rules });
describe("control plane domain", () => {
  it("parses only positive canonical u64 amounts", () => { expect(parseMist(U64_MAX.toString())).toBe(U64_MAX); for (const value of ["0","01","-1","1.0","1e3"," 1",(U64_MAX + 1n).toString()]) expect(() => parseMist(value)).toThrow(DomainError); });
  it("normalizes and enforces both policies", () => { expect(evaluatePolicies(policy(), policy([{ recipient: A, effect: "allow" }]), A, 10n).allowed).toBe(true); expect(evaluatePolicies(policy(), policy([{ recipient: A, effect: "allow" }]), B, 10n).code).toBe("RECIPIENT_NOT_ALLOWED"); expect(evaluatePolicies(policy([{ recipient: A, effect: "deny" }]), policy(), A, 1n).code).toBe("BLOCKED_RECIPIENT"); });
  it("rejects contradictory recipient rules and invalid limits", () => { expect(() => validatePolicy(policy([{ recipient:A,effect:"allow"},{recipient:"0x01",effect:"deny"}]))).toThrow(DomainError); expect(() => validatePolicy({ ...policy(), maxPerDayMist: 9n })).toThrow(DomainError); });
  it("allows every declared intent transition and rejects terminal rewinds", () => {
    const edges = [
      ["received", "policy_blocked"], ["received", "reserved"], ["received", "failed"],
      ["policy_blocked", "evidence_pending"], ["reserved", "simulating"], ["reserved", "expired"],
      ["simulating", "simulation_blocked"], ["simulating", "evidence_pending"], ["simulating", "failed"],
      ["simulation_blocked", "evidence_pending"], ["evidence_pending", "evidence_published"], ["evidence_pending", "failed"],
      ["evidence_published", "signing"], ["evidence_published", "abort_record_pending"], ["signing", "submitted"],
      ["signing", "failed"], ["signing", "submission_unknown"], ["submitted", "confirmed"],
      ["submitted", "submission_unknown"], ["submitted", "failed"], ["submission_unknown", "submitted"],
      ["submission_unknown", "confirmed"], ["submission_unknown", "failed"], ["abort_record_pending", "blocked"],
    ] as const;
    for (const [from, to] of edges) expect(transitionIntent(from, to)).toBe(to);
    expect(() => transitionIntent("confirmed", "signing")).toThrow(DomainError);
  });
  it("uses UTC calendar period boundaries and stable purpose tags", () => { const p = utcPeriods(new Date("2026-02-28T23:59:59.999Z")); expect(p.day.toISOString()).toBe("2026-02-28T00:00:00.000Z"); expect(p.month.toISOString()).toBe("2026-02-01T00:00:00.000Z"); const input={organizationId:"o",assignmentId:"a",idempotencyKey:"key",requestHash:"hash"}; expect(purposeTag(input)).toBe(purposeTag({ ...input })); });
});
