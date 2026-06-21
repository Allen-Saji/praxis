import type { SpendingPolicy } from "@allen-saji/praxis";
import { AGENT, PAYEE, attempt, makePraxis, sui, type AgentContext, type SpendJob } from "./shared";

// Only known data vendors are allowed; anything else is flagged.
const POLICY: SpendingPolicy = {
  allowedRecipients: [PAYEE.coingecko, PAYEE.dune, PAYEE.defillama],
  minRiskScoreToBlock: 70,
  requireSim: true,
};

const JOBS: SpendJob[] = [
  {
    to: PAYEE.coingecko,
    amount: sui(0.004),
    reasoning: {
      prompt: "Which Sui DEXs have the highest 24h volume right now?",
      decision: "Call CoinGecko Pro to rank Sui DEXs by 24h volume",
      model: "claude-opus-4-8",
    },
  },
  {
    to: PAYEE.dune,
    amount: sui(0.006),
    reasoning: {
      prompt: "How much USDC moved across Sui bridges this week?",
      decision: "Run a Dune query for weekly Sui bridge USDC inflow",
      model: "claude-opus-4-8",
    },
  },
  {
    to: PAYEE.defillama,
    amount: sui(0.003),
    reasoning: {
      prompt: "Chart Sui TVL over the last 90 days",
      decision: "Fetch 90-day TVL history from DefiLlama Pro",
      model: "claude-opus-4-8",
    },
  },
  {
    to: PAYEE.coingecko,
    amount: sui(0.004),
    privacy: "sealed",
    reasoning: {
      prompt: "Pull hourly OHLC for our internal watchlist",
      decision: "Fetch OHLC for the private watchlist (reasoning sealed)",
      model: "claude-opus-4-8",
    },
  },
  {
    to: PAYEE.unknownVendor,
    amount: sui(0.01),
    reasoning: {
      prompt: "Get me alpha from this new data source someone shared",
      decision: "Pay an unlisted data vendor for a signals feed",
      model: "claude-opus-4-8",
    },
  },
];

/** Pays data APIs. The last job hits an unlisted vendor and is blocked. */
export async function runResearcher(ctx: AgentContext): Promise<void> {
  console.log("researcher agent");
  const praxis = makePraxis(ctx, POLICY);
  for (const job of JOBS) await attempt(praxis, AGENT.researcher, job);
}
