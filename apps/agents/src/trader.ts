import type { SpendingPolicy } from "@allen-saji/praxis";
import { AGENT, PAYEE, attempt, makePraxis, sui, type AgentContext, type SpendJob } from "./shared";

// Per-trade and per-day caps. Cumulative day spend is tracked across this run.
const POLICY: SpendingPolicy = {
  maxPerTx: sui(0.05),
  maxPerDay: sui(0.1),
  minRiskScoreToBlock: 80,
  requireSim: true,
};

const JOBS: SpendJob[] = [
  {
    to: PAYEE.cetus,
    amount: sui(0.02),
    reasoning: {
      prompt: "Rebalance into SUI on the 2% dip",
      decision: "Pay Cetus router fee for a 0.02 SUI swap",
      model: "claude-opus-4-8",
    },
  },
  {
    to: PAYEE.turbos,
    amount: sui(0.03),
    reasoning: {
      prompt: "Take partial profit on the bounce",
      decision: "Pay Turbos router fee for a 0.03 SUI swap",
      model: "claude-opus-4-8",
    },
  },
  {
    to: PAYEE.cetus,
    amount: sui(0.06),
    reasoning: {
      prompt: "Large reallocation signal fired",
      decision: "Attempt a 0.06 SUI swap fee (above the per-trade cap)",
      model: "claude-opus-4-8",
    },
  },
  {
    to: PAYEE.cetus,
    amount: sui(0.04),
    reasoning: {
      prompt: "Scale back into the position",
      decision: "Pay Cetus router fee for a 0.04 SUI swap",
      model: "claude-opus-4-8",
    },
  },
  {
    to: PAYEE.turbos,
    amount: sui(0.03),
    reasoning: {
      prompt: "Final top-up for the session",
      decision: "Attempt a 0.03 SUI swap fee (would breach the daily cap)",
      model: "claude-opus-4-8",
    },
  },
];

/** Pays DEX routers. One trade exceeds the per-tx cap, one breaches the daily cap. */
export async function runTrader(ctx: AgentContext): Promise<void> {
  console.log("trader agent");
  const praxis = makePraxis(ctx, POLICY);
  for (const job of JOBS) await attempt(praxis, AGENT.trader, job);
}
