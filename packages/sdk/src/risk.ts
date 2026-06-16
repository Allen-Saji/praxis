import { normalizeSuiAddress } from "@mysten/sui/utils";
import type {
  BalanceDelta,
  PolicyViolation,
  Recommendation,
  Risk,
  SpendingPolicy,
} from "./types";

export interface RiskInput {
  simSuccess: boolean;
  balanceChanges: BalanceDelta[];
  gasEstimate: bigint;
  sender: string;
  recipient: string;
  amount: bigint;
  coinType: string;
  /** Sender's balance of coinType before the spend. */
  walletBalance: bigint;
  /** Cumulative amount already spent today by this agent. */
  daySpent: bigint;
  policy?: SpendingPolicy;
  typicalGas?: bigint;
}

export interface RiskOutput {
  riskScore: number;
  risks: Risk[];
  policyViolations: PolicyViolation[];
  recommendation: Recommendation;
}

const DRAIN_RATIO = 0.8;
const DEFAULT_BLOCK_AT = 80;
const REVIEW_AT = 30;
const DEFAULT_TYPICAL_GAS = 5_000_000n;

/** Rule-based pre-flight risk scoring (SPEC section 8.2.3). */
export function assessRisk(input: RiskInput): RiskOutput {
  const risks: Risk[] = [];
  const policyViolations: PolicyViolation[] = [];
  let score = 0;

  if (!input.simSuccess) {
    risks.push({
      level: "critical",
      code: "SIM_FAILED",
      message: "Transaction simulation failed; signing would likely revert.",
    });
    score = 100;
  }

  const outflow = senderOutflow(input.balanceChanges, input.sender, input.coinType);
  if (input.walletBalance > 0n && outflow > 0n) {
    const ratio = Number(outflow) / Number(input.walletBalance);
    if (ratio >= DRAIN_RATIO) {
      risks.push({
        level: "critical",
        code: "DRAIN_DETECTED",
        message: `This spend moves ${Math.round(ratio * 100)}% of the wallet balance in a single transaction.`,
      });
      score = Math.max(score, 90);
    }
  }

  const p = input.policy;
  if (p) {
    if (p.blockedRecipients?.some((a) => eq(a, input.recipient))) {
      const v = { code: "BLOCKED_RECIPIENT", message: "Recipient is on the policy blocklist." };
      policyViolations.push(v);
      risks.push({ level: "critical", ...v });
      score = Math.max(score, 95);
    }
    if (
      p.allowedRecipients &&
      p.allowedRecipients.length > 0 &&
      !p.allowedRecipients.some((a) => eq(a, input.recipient))
    ) {
      const v = { code: "UNKNOWN_RECIPIENT", message: "Recipient is not in the policy allowlist." };
      policyViolations.push(v);
      risks.push({ level: "high", ...v });
      score = Math.max(score, 70);
    }
    if (p.maxPerTx && p.maxPerTx > 0n && input.amount > p.maxPerTx) {
      const v = {
        code: "OVER_TX_LIMIT",
        message: `Amount exceeds the per-transaction limit (${p.maxPerTx}).`,
      };
      policyViolations.push(v);
      risks.push({ level: "high", ...v });
      score = Math.max(score, 60);
    }
    if (p.maxPerDay && p.maxPerDay > 0n && input.daySpent + input.amount > p.maxPerDay) {
      const v = {
        code: "OVER_DAILY_LIMIT",
        message: `Cumulative daily spend would exceed the limit (${p.maxPerDay}).`,
      };
      policyViolations.push(v);
      risks.push({ level: "high", ...v });
      score = Math.max(score, 60);
    }
    if (p.requireSim && !input.simSuccess) {
      policyViolations.push({ code: "SIM_REQUIRED", message: "Policy requires a passing simulation." });
    }
  }

  const typical = input.typicalGas ?? DEFAULT_TYPICAL_GAS;
  if (input.gasEstimate > typical * 10n) {
    risks.push({
      level: "medium",
      code: "HIGH_GAS",
      message: "Gas estimate is unusually high for this transaction type.",
    });
    score = Math.max(score, 35);
  }

  score = Math.min(100, score);
  return {
    riskScore: score,
    risks,
    policyViolations,
    recommendation: recommend(score, p),
  };
}

function recommend(score: number, policy?: SpendingPolicy): Recommendation {
  const blockAt =
    policy?.minRiskScoreToBlock && policy.minRiskScoreToBlock > 0
      ? policy.minRiskScoreToBlock
      : DEFAULT_BLOCK_AT;
  if (score >= blockAt) return "abort";
  if (score >= REVIEW_AT) return "review";
  return "proceed";
}

function senderOutflow(changes: BalanceDelta[], sender: string, coinType: string): bigint {
  let out = 0n;
  for (const c of changes) {
    if (!eq(c.owner, sender)) continue;
    if (coinType && c.coinType !== coinType) continue;
    const amt = BigInt(c.amount);
    if (amt < 0n) out += -amt;
  }
  return out;
}

function eq(a: string, b: string): boolean {
  try {
    return normalizeSuiAddress(a) === normalizeSuiAddress(b);
  } catch {
    return a === b;
  }
}
