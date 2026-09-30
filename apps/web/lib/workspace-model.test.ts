import { describe, expect, it } from "vitest";
import { assignmentBudget, assignmentTransactionCap } from "./workspace-model";

type Data = Parameters<typeof assignmentBudget>[0];
function data(): Data {
  return {
    assignments: [{ id: "a", walletId: "w" }, { id: "b", walletId: "w" }],
    scopes: [{ walletId: "w", currentVersionId: "wp" }, { assignmentId: "a", currentVersionId: "ap" }, { assignmentId: "b", currentVersionId: "bp" }],
    policyVersions: [
      { version: { id: "wp", status: "active", maxPerTxMist: "5", maxPerDayMist: "20", maxPerMonthMist: "100" } },
      { version: { id: "ap", status: "active", maxPerTxMist: "8", maxPerDayMist: "10", maxPerMonthMist: "50" } },
      { version: { id: "bp", status: "active", maxPerTxMist: "3", maxPerDayMist: "5", maxPerMonthMist: "30" } },
    ],
    walletCounters: [{ wallet: { id: "w" }, counter: { periodKind: "day", spentMist: "15", reservedMist: "3" } }],
    assignmentCounters: [{ assignment: { id: "a" }, counter: { periodKind: "day", spentMist: "4", reservedMist: "1" } }],
  } as unknown as Data;
}

describe("agent allowance presentation", () => {
  it("keeps individual allowances independent while exposing shared headroom", () => {
    const value = data();
    expect(assignmentBudget(value, "a", "day")).toMatchObject({ available: 5n, sharedAvailable: 2n, effectiveAvailable: 2n, limitedByWallet: true });
    expect(assignmentBudget(value, "b", "day")).toMatchObject({ spent: 0n, reserved: 0n, available: 5n, sharedAvailable: 2n });
    expect(assignmentTransactionCap(value, "a")).toBe(5n);
    expect(assignmentTransactionCap(value, "b")).toBe(3n);
  });
  it("does not display missing policies as unlimited or produce negative remaining", () => {
    const value = data();
    value.policyVersions = value.policyVersions.filter(({ version }) => version.id !== "bp");
    expect(assignmentBudget(value, "b", "day").effectiveAvailable).toBeNull();
    expect(assignmentTransactionCap(value, "b")).toBeNull();
    value.assignmentCounters[0]!.counter.spentMist = "20";
    expect(assignmentBudget(value, "a", "day").available).toBe(0n);
    expect(assignmentBudget(value, "a", "month").available).toBe(50n);
  });
  it("preserves integer precision beyond Number.MAX_SAFE_INTEGER", () => {
    const value = data();
    value.policyVersions[1]!.version.maxPerDayMist = "999999999999999999";
    expect(assignmentBudget(value, "a", "day").available).toBe(999999999999999994n);
  });
});
