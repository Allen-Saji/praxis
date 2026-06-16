/**
 * Risk band mapping and reason-code labels. Thresholds match the SDK guard:
 * review at 30, block at 80 (DESIGN.md section 8).
 */
import type { RiskLevel } from "@praxis/sdk";

export type RiskBand = RiskLevel;

/** Map a 0..100 risk score to its band. 0-29 low, 30-59 med, 60-79 high, 80+ critical. */
export function scoreToBand(score: number): RiskBand {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

/** Human label for an AbortRecorded reason_code. */
export function reasonCodeLabel(code: number): string {
  switch (code) {
    case 0:
      return "agent_decision";
    case 1:
      return "policy_block";
    case 2:
      return "high_risk";
    case 3:
      return "sim_failed";
    default:
      return "unknown";
  }
}

/** Plain-words framing for an abort reason (DESIGN.md section 12). */
export function reasonPlain(reason: string): string {
  switch (reason) {
    case "high_risk":
      return "The simulation scored above the block threshold.";
    case "policy_block":
      return "A spending-policy rule blocked this transaction.";
    case "sim_failed":
      return "The dry-run reverted, so the spend never signed.";
    case "agent_decision":
      return "The agent's own gate returned false on the report.";
    default:
      return "This spend was blocked before signing.";
  }
}

export const RISK_ORDER: RiskBand[] = ["low", "medium", "high", "critical"];

export const RISK_LABEL: Record<RiskBand, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};
