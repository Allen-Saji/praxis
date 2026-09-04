import { describe, expect, it, vi } from "vitest";
import {
  DomainError,
  FixedClock,
  MutableClock,
  resolveActivePoliciesFromPort,
  revalidateBeforeSigningFromPort,
  type PolicyRepositoryPort,
  type PolicySnapshot,
  type PreSignExecutionContext,
  type PreSignStatusPort,
} from "../src";
import { policyHash, type PolicyInput, type PolicyVersionInput } from "../src";

const policy: PolicyInput = { maxPerTxMist: 1n, maxPerDayMist: 2n, maxPerMonthMist: 3n, blockRiskScoreAt: 80, requireSimulation: true, rules: [] };
const versions: PolicyVersionInput[] = [{ id: "wv", scopeId: "ws", version: 1, status: "active", policy }, { id: "av", scopeId: "as", version: 1, status: "active", policy }];
const snapshot: PolicySnapshot = {
  wallet: { versionId: "wv", version: 1, policyHash: policyHash(policy), policy: { maxPerTxMist: "1", maxPerDayMist: "2", maxPerMonthMist: "3", blockRiskScoreAt: 80, requireSimulation: true, rules: [] } },
  assignment: { versionId: "av", version: 1, policyHash: policyHash(policy), policy: { maxPerTxMist: "1", maxPerDayMist: "2", maxPerMonthMist: "3", blockRiskScoreAt: 80, requireSimulation: true, rules: [] } },
  effectivePolicyHash: policyHash(policy),
};

const reservation = { id: "r", organizationId: "o", intentId: "i", walletId: "w", assignmentId: "x", amountMist: 1n, state: "active" as const, expiresAt: new Date("2030-01-01T00:00:00Z") };
const executionLease = { id: "l", organizationId: "o", intentId: "i", walletId: "w", workerId: "worker-1", state: "active" as const, expiresAt: new Date("2030-01-01T00:00:00Z") };
const executionContext: PreSignExecutionContext = {
  organizationId: "o",
  intent: { id: "i", organizationId: "o", assignmentId: "x", walletId: "w", agentId: "a", credentialId: "c", amountMist: 1n, state: "evidence_published" },
  wallet: { id: "w", organizationId: "o", status: "enabled", archivedAt: null },
  agent: { id: "a", organizationId: "o", status: "active" },
  assignment: { id: "x", organizationId: "o", walletId: "w", agentId: "a", status: "active" },
  credential: { id: "c", organizationId: "o", assignmentId: "x", status: "active", expiresAt: new Date("2030-01-01T00:00:00Z") },
  policySnapshot: snapshot,
  reservation,
  executionLease,
};

const makeRepository = (overrides: Partial<PreSignStatusPort> = {}): PreSignStatusPort => ({
  loadExecutionContext: vi.fn(async () => executionContext),
  ...overrides,
});

const makeInput = (repository: PreSignStatusPort, overrides: Record<string, unknown> = {}) => ({
  repository,
  organizationId: "o",
  assignmentId: "x",
  intentId: "i",
  amountMist: 1n,
  workerId: "worker-1",
  expectedSnapshot: snapshot,
  now: new Date("2029-01-01T00:00:00Z"),
  ...overrides,
});

describe("framework-neutral control-plane ports", () => {
  it("loads scopes and versions through a repository port", async () => {
    const repository: PolicyRepositoryPort = {
      loadScope: vi.fn(async (id) => id === "ws" ? { id, scopeType: "wallet", currentVersionId: "wv" } : { id, scopeType: "assignment", currentVersionId: "av" }),
      loadVersions: vi.fn(async (id) => versions.filter((version) => version.scopeId === id)),
    };
    const result = await resolveActivePoliciesFromPort(repository, "ws", "as");
    expect(result.snapshot.wallet.versionId).toBe("wv");
    expect(repository.loadVersions).toHaveBeenCalledTimes(2);
    await expect(resolveActivePoliciesFromPort({ ...repository, loadScope: vi.fn(async () => null) }, "ws", "as")).rejects.toMatchObject({ code: "NO_ACTIVE_POLICY" });
    await expect(resolveActivePoliciesFromPort({ ...repository, loadScope: vi.fn(async () => { throw new Error("provider poison"); }) }, "ws", "as")).rejects.toMatchObject({ code: "NO_ACTIVE_POLICY", message: "no active policy is available" });
  });

  it("revalidates live statuses and snapshots through a status port", async () => {
    const repository = makeRepository();
    await expect(revalidateBeforeSigningFromPort(makeInput(repository))).resolves.toEqual({ ok: true });
    await expect(revalidateBeforeSigningFromPort(makeInput(repository, { organizationId: undefined }))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(repository, { amountMist: "1" }))).resolves.toEqual({ ok: true });
    await expect(revalidateBeforeSigningFromPort(makeInput(repository, { amountMist: "bad" }))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED", message: "pre-sign revalidation failed" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, intent: { ...executionContext.intent, amountMist: "1" } })) })))).resolves.toEqual({ ok: true });
    expect(repository.loadExecutionContext).toHaveBeenCalledWith({ organizationId: "o", assignmentId: "x", intentId: "i" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => null) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, wallet: { ...executionContext.wallet, organizationId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, wallet: { ...executionContext.wallet, status: "active" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, agent: { ...executionContext.agent, organizationId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, assignment: { ...executionContext.assignment, organizationId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, assignment: { ...executionContext.assignment, walletId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, assignment: { ...executionContext.assignment, agentId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, credential: { ...executionContext.credential, assignmentId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, intent: { ...executionContext.intent, organizationId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, intent: { ...executionContext.intent, walletId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, reservation: { ...reservation, organizationId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, reservation: { ...reservation, intentId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, executionLease: { ...executionLease, workerId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, executionLease: { ...executionLease, organizationId: "other" } })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => ({ ...executionContext, reservation: null, executionLease: null })) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
    await expect(revalidateBeforeSigningFromPort(makeInput(makeRepository({ loadExecutionContext: vi.fn(async () => { throw new Error("provider poison"); }) })))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED", message: "pre-sign revalidation failed" });
    await expect(revalidateBeforeSigningFromPort(makeInput(repository, { amountMist: 2n }))).rejects.toMatchObject({ code: "PRESIGN_REVALIDATION_FAILED" });
  });

  it("keeps fake time deterministic and rejects invalid clocks", () => {
    expect(() => new FixedClock(new Date("invalid"))).toThrow(DomainError);
    expect(() => new MutableClock(new Date("invalid"))).toThrow(DomainError);
    const clock = new MutableClock(new Date("2024-01-31T23:59:59Z"));
    expect(() => clock.set(new Date("invalid"))).toThrow(DomainError);
    expect(() => clock.advance(Number.NaN)).toThrow(DomainError);
  });
});
