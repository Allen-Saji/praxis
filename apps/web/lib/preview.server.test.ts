import { describe, expect, it, vi } from "vitest";
import { resolveActivePolicies } from "@allen-saji/praxis-control-plane";
import type { SuiTransport } from "@allen-saji/praxis";
vi.mock("server-only", () => ({}));
import { previewSpend } from "./preview.server";

const context = { organization: { id: "org" }, wallet: { id: "wallet", suiAddress: "0x2" }, agent: { id: "agent" }, assignment: { id: "assignment" }, credential: { id: "credential" } };
const request = { recipient: "0x3", amountMist: "1", coinType: "0x2::sui::SUI" as const, privacy: "public" as const, reasoning: { prompt: "Pay", decision: "Approved", model: "test" } };

function dependencies() {
  const policy = { maxPerTxMist: 10n, maxPerDayMist: 10n, maxPerMonthMist: 20n, blockRiskScoreAt: 80, requireSimulation: true };
  const policies = resolveActivePolicies({ walletPolicy: { id: "w", scopeId: "ws", version: 1, status: "active", policy }, assignmentPolicy: { id: "a", scopeId: "as", version: 1, status: "active", policy } });
  const usage = { wallet: { day: { spentMist: "0", reservedMist: "0" }, month: { spentMist: "0", reservedMist: "0" } }, assignment: { day: { spentMist: "0", reservedMist: "0" }, month: { spentMist: "0", reservedMist: "0" } } };
  const value = { policies, usage, address: "0x2", observedAt: new Date("2026-09-30T12:00:00Z") };
  const simulate = vi.fn(async () => ({ $kind: "Transaction", Transaction: { digest: "sim", status: { success: true, error: null }, effects: { gasUsed: { computationCost: "2", storageCost: "0", storageRebate: "0" } }, balanceChanges: [{ address: "0x2", coinType: "0x2::sui::SUI", amount: "-1" }, { address: "0x3", coinType: "0x2::sui::SUI", amount: "1" }] } }));
  const execute = vi.fn(async () => { throw new Error("preview must never execute"); });
  const transport: SuiTransport = { simulateTransaction: simulate, executeTransaction: execute, getBalance: async () => ({ balance: { balance: "1000" } }), getObject: async () => ({}) };
  return { value, snapshot: vi.fn(async () => value), transport, simulate, execute };
}

describe("advisory payment preview", () => {
  it("returns a report without signing or executing and binds reads to credential-derived identity", async () => {
    const deps = dependencies();
    const preview = await previewSpend({ context, request }, deps);
    expect(preview.executionAuthorized).toBe(false);
    expect(preview.recommendation).toBe("proceed");
    expect(preview.simulationStatus).toBe("completed");
    expect(deps.snapshot).toHaveBeenCalledWith({ organizationId: "org", walletId: "wallet", agentId: "agent", assignmentId: "assignment", credentialId: "credential" });
    expect(deps.execute).not.toHaveBeenCalled();
    expect(preview.budgets.agent.day.remainingMist).toBe("10");
    expect(() => JSON.stringify(preview)).not.toThrow();
  });

  it.each(["wallet", "assignment"] as const)("skips simulation when the %s budget is exhausted", async (scope) => {
    const deps = dependencies();
    deps.value.usage[scope].day.reservedMist = "10";
    const result = await previewSpend({ context, request }, deps);
    expect(result.simulationStatus).toBe("skipped");
    expect(result.policyViolations).toContainEqual({ code: `${scope.toUpperCase()}_DAY_BUDGET_EXCEEDED`, scope, period: "day" });
    expect(deps.simulate).not.toHaveBeenCalled();
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("returns an abort and safe error when simulation fails", async () => {
    const deps = dependencies();
    deps.simulate.mockRejectedValue(new Error("private RPC details"));
    const result = await previewSpend({ context, request }, deps);
    expect(result.recommendation).toBe("abort");
    expect(result.simulationStatus).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("private RPC");
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("blocks drain findings even when the policy budget would allow the request", async () => {
    const deps = dependencies();
    deps.transport.getBalance = async () => ({ balance: { balance: "1" } });
    expect((await previewSpend({ context, request }, deps)).recommendation).toBe("abort");
    expect(deps.execute).not.toHaveBeenCalled();
  });
});
