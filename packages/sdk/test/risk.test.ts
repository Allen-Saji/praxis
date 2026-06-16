import { describe, expect, it } from "vitest";
import { assessRisk, type RiskInput } from "../src/risk";

const SUI = "0x2::sui::SUI";
const SENDER = "0xa11ce";
const RECIP = "0xb0b";

function base(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    simSuccess: true,
    balanceChanges: [],
    gasEstimate: 1_000_000n,
    sender: SENDER,
    recipient: RECIP,
    amount: 1_000n,
    coinType: SUI,
    walletBalance: 1_000_000n,
    daySpent: 0n,
    ...overrides,
  };
}

describe("assessRisk", () => {
  it("clears a clean spend", () => {
    const r = assessRisk(base());
    expect(r.riskScore).toBe(0);
    expect(r.recommendation).toBe("proceed");
    expect(r.risks).toHaveLength(0);
  });

  it("flags a drain when most of the balance leaves at once", () => {
    const r = assessRisk(
      base({
        walletBalance: 1_000_000n,
        balanceChanges: [{ owner: SENDER, coinType: SUI, amount: "-900000" }],
      }),
    );
    expect(r.risks.some((x) => x.code === "DRAIN_DETECTED")).toBe(true);
    expect(r.riskScore).toBeGreaterThanOrEqual(90);
    expect(r.recommendation).toBe("abort");
  });

  it("blocks a failed simulation", () => {
    const r = assessRisk(base({ simSuccess: false }));
    expect(r.risks.some((x) => x.code === "SIM_FAILED")).toBe(true);
    expect(r.riskScore).toBe(100);
    expect(r.recommendation).toBe("abort");
  });

  it("treats a policy violation as a hard block even below the score threshold", () => {
    const r = assessRisk(
      base({
        amount: 2_000n,
        policy: { maxPerTx: 1_000n, minRiskScoreToBlock: 80 },
      }),
    );
    expect(r.policyViolations.some((v) => v.code === "OVER_TX_LIMIT")).toBe(true);
    expect(r.riskScore).toBeLessThan(80);
    expect(r.recommendation).toBe("abort");
  });

  it("enforces the daily cap using cumulative spend", () => {
    const r = assessRisk(
      base({
        amount: 300n,
        daySpent: 800n,
        policy: { maxPerDay: 1_000n },
      }),
    );
    expect(r.policyViolations.some((v) => v.code === "OVER_DAILY_LIMIT")).toBe(true);
    expect(r.recommendation).toBe("abort");
  });

  it("blocks a recipient on the blocklist", () => {
    const r = assessRisk(base({ policy: { blockedRecipients: [RECIP] } }));
    expect(r.policyViolations.some((v) => v.code === "BLOCKED_RECIPIENT")).toBe(true);
    expect(r.recommendation).toBe("abort");
  });
});
