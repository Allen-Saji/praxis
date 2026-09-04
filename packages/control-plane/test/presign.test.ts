import { describe, expect, it } from "vitest";
import { DomainError, FixedClock, MutableClock, canTransitionIntent, hashCanonical, nextUtcDay, nextUtcMonth, revalidateBeforeSigning, transitionIntentRecord, utcPeriods, type PolicySnapshot } from "../src";

const snapshot = (effectivePolicyHash = "a".repeat(64)): PolicySnapshot => ({
  wallet: { versionId: "wallet-v1", version: 1, policyHash: hashCanonical({ maxPerTxMist: "1", maxPerDayMist: "2", maxPerMonthMist: "3", blockRiskScoreAt: 80, requireSimulation: true, rules: [] }), policy: { maxPerTxMist: "1", maxPerDayMist: "2", maxPerMonthMist: "3", blockRiskScoreAt: 80, requireSimulation: true, rules: [] } },
  assignment: { versionId: "assignment-v1", version: 1, policyHash: hashCanonical({ maxPerTxMist: "1", maxPerDayMist: "2", maxPerMonthMist: "3", blockRiskScoreAt: 80, requireSimulation: true, rules: [] }), policy: { maxPerTxMist: "1", maxPerDayMist: "2", maxPerMonthMist: "3", blockRiskScoreAt: 80, requireSimulation: true, rules: [] } },
  effectivePolicyHash,
});

describe("pre-sign revalidation and clocks", () => {
  it("requires unchanged identity, active statuses, reservation, and policy snapshot", () => {
    const expected = snapshot();
    const now = new Date("2029-01-01T00:00:00Z");
    const valid = {
      expectedSnapshot: expected,
      currentSnapshot: structuredClone(expected),
      expected: { walletId: "w", assignmentId: "x", agentId: "a", credentialId: "c" },
      current: { walletId: "w", assignmentId: "x", agentId: "a", credentialId: "c" },
      walletId: "w",
      assignmentId: "x",
      agentId: "a",
      credentialId: "c",
      intentId: "i",
      amountMist: 1n,
      workerId: "worker-1",
      walletStatus: "enabled",
      agentStatus: "active",
      assignmentStatus: "active",
      credentialStatus: "active",
      intentState: "evidence_published",
      walletArchivedAt: null,
      reservation: { id: "r", organizationId: "o", intentId: "i", walletId: "w", assignmentId: "x", amountMist: 1n, state: "active" as const, expiresAt: new Date("2030-01-01T00:00:00Z") },
      executionLease: { id: "l", organizationId: "o", intentId: "i", walletId: "w", workerId: "worker-1", state: "active" as const, expiresAt: new Date("2030-01-01T00:00:00Z") },
      organizationId: "o",
      bindings: { organizationId: "o", intent: { id: "i", organizationId: "o", assignmentId: "x", walletId: "w", agentId: "a", credentialId: "c", amountMist: 1n }, wallet: { id: "w", organizationId: "o" }, agent: { id: "a", organizationId: "o" }, assignment: { id: "x", organizationId: "o", walletId: "w", agentId: "a" }, credential: { id: "c", organizationId: "o", assignmentId: "x" }, reservation: { id: "r", organizationId: "o", intentId: "i", walletId: "w", assignmentId: "x", amountMist: 1n }, executionLease: { id: "l", organizationId: "o", intentId: "i", walletId: "w", workerId: "worker-1" } },
      credentialExpiresAt: new Date("2030-01-01T00:00:00Z"),
      now,
    };
    expect(revalidateBeforeSigning(valid)).toEqual({ ok: true });

    const omissions = [
      "expectedSnapshot", "currentSnapshot", "organizationId", "bindings", "walletId", "assignmentId", "agentId", "credentialId", "intentId", "amountMist", "workerId",
      "walletStatus", "agentStatus", "assignmentStatus", "credentialStatus", "walletArchivedAt", "reservation", "executionLease", "intentState", "credentialExpiresAt", "now",
    ] as const;
    for (const field of omissions) expect(() => revalidateBeforeSigning({ ...valid, [field]: undefined })).toThrow(DomainError);
    const mismatches = [
      { currentSnapshot: snapshot("d".repeat(64)) },
      { currentSnapshot: { ...expected, wallet: { ...expected.wallet, policyHash: "f".repeat(64) } } },
      { currentSnapshot: { ...expected, assignment: { ...expected.assignment, policy: { ...expected.assignment.policy, extra: true } } } },
      { walletId: "other" }, { assignmentId: "other" }, { agentId: "other" }, { credentialId: "other" }, { intentId: "other" }, { amountMist: 2n }, { workerId: "other" },
      { organizationId: "other" },
      { walletStatus: "active" as const }, { walletStatus: "disabled" as const }, { agentStatus: "suspended" as const }, { assignmentStatus: "disabled" as const }, { credentialStatus: "revoked" as const },
      { walletArchivedAt: new Date() }, { intentState: "signing" as const }, { credentialExpiresAt: new Date("2020-01-01T00:00:00Z") }, { now: new Date("2031-01-01T00:00:00Z") },
      { reservation: null }, { reservation: { ...valid.reservation, state: "released" as const } }, { reservation: { ...valid.reservation, intentId: "other" } },
      { reservation: { ...valid.reservation, walletId: "other" } }, { reservation: { ...valid.reservation, assignmentId: "other" } }, { reservation: { ...valid.reservation, amountMist: 2n } },
      { reservation: { ...valid.reservation, expiresAt: new Date("2020-01-01T00:00:00Z") } },
      { executionLease: null }, { executionLease: { ...valid.executionLease, state: "released" as const } }, { executionLease: { ...valid.executionLease, intentId: "other" } },
      { executionLease: { ...valid.executionLease, walletId: "other" } }, { executionLease: { ...valid.executionLease, workerId: "other" } }, { executionLease: { ...valid.executionLease, expiresAt: new Date("2020-01-01T00:00:00Z") } },
      { executionLease: { ...valid.executionLease, workerId: undefined, ownerId: "other" } },
      { executionLease: { ...valid.executionLease, ownerId: "other" } },
      { bindings: { ...valid.bindings, organizationId: "other" } },
      { bindings: { ...valid.bindings, wallet: { organizationId: "other" } } },
      { bindings: { ...valid.bindings, agent: { organizationId: "other" } } },
      { bindings: { ...valid.bindings, assignment: { ...valid.bindings.assignment, walletId: "other" } } },
      { bindings: { ...valid.bindings, assignment: { ...valid.bindings.assignment, agentId: "other" } } },
      { bindings: { ...valid.bindings, credential: { ...valid.bindings.credential, assignmentId: "other" } } },
      { bindings: { ...valid.bindings, intent: { ...valid.bindings.intent, organizationId: "other" } } },
      { bindings: { ...valid.bindings, wallet: { ...valid.bindings.wallet, id: "other" } } },
      { bindings: { ...valid.bindings, agent: { ...valid.bindings.agent, id: "other" } } },
      { bindings: { ...valid.bindings, assignment: { ...valid.bindings.assignment, id: "other" } } },
      { bindings: { ...valid.bindings, credential: { ...valid.bindings.credential, id: "other" } } },
      { bindings: { ...valid.bindings, reservation: { ...valid.bindings.reservation, walletId: "other" } } },
      { bindings: { ...valid.bindings, executionLease: { ...valid.bindings.executionLease, intentId: "other" } } },
      { bindings: { ...valid.bindings, reservation: { organizationId: "other" } } },
      { bindings: { ...valid.bindings, executionLease: { organizationId: "other" } } },
      { bindings: { ...valid.bindings, intent: { ...valid.bindings.intent, assignmentId: "other" } } },
      { bindings: { ...valid.bindings, intent: { ...valid.bindings.intent, walletId: "other" } } },
      { bindings: { ...valid.bindings, intent: { ...valid.bindings.intent, agentId: "other" } } },
      { bindings: { ...valid.bindings, intent: { ...valid.bindings.intent, credentialId: "other" } } },
      { bindings: { ...valid.bindings, intent: { ...valid.bindings.intent, amountMist: 2n } } },
    ];
    for (const mismatch of mismatches) expect(() => revalidateBeforeSigning({ ...valid, ...mismatch })).toThrow(DomainError);
    expect(revalidateBeforeSigning({ ...valid, credentialExpiresAt: null })).toEqual({ ok: true });
  });

  it("provides deterministic fake clocks across boundaries", () => {
    const fixed = new FixedClock(new Date("2024-02-29T23:59:59Z"));
    expect(fixed.now().toISOString()).toBe("2024-02-29T23:59:59.000Z");
    const mutable = new MutableClock(fixed.now());
    expect(mutable.advance(1000).toISOString()).toBe("2024-03-01T00:00:00.000Z");
    mutable.set(new Date("2024-12-31T00:00:00Z"));
    expect(mutable.now().getUTCMonth()).toBe(11);
    expect(nextUtcDay(new Date("2024-02-29T23:00:00Z")).toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(nextUtcMonth(new Date("2024-02-29T23:00:00Z")).toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(utcPeriods(new Date("2024-02-29T23:00:00Z")).month.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(() => utcPeriods(new Date("invalid"))).toThrow(DomainError);
    expect(canTransitionIntent("received", "reserved")).toBe(true);
    expect(canTransitionIntent("received", "confirmed")).toBe(false);
    expect(canTransitionIntent("evidence_pending", "failed")).toBe(false);
    expect(canTransitionIntent("evidence_pending", "failed", { kind: "evidence_failure", errorCode: "WALRUS_TIMEOUT", noSignature: true })).toBe(true);
    expect(canTransitionIntent("submission_unknown", "failed")).toBe(false);
    const context = { intentId: "i", expectedPurposeTag: "a".repeat(64) };
    expect(canTransitionIntent("submission_unknown", "failed", { kind: "no_success", outcome: "not_found", checkedAt: new Date("2029-01-01T00:00:00Z"), evidence: { kind: "operator_review", intentId: "i", purposeTag: context.expectedPurposeTag, reviewId: "review-1" } }, context)).toBe(true);
    expect(canTransitionIntent("submission_unknown", "failed", { kind: "no_success", outcome: "not_found", checkedAt: new Date("2029-01-01T00:00:00Z"), searchAttempts: 1 } as never)).toBe(false);
    expect(transitionIntentRecord({ state: "received", stateVersion: 4 }, "reserved")).toEqual({ state: "reserved", stateVersion: 5 });
  });
});
