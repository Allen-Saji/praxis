import type { PolicySnapshot } from "@allen-saji/praxis-control-plane";
import type { NormalizedSimulationReport } from "@allen-saji/praxis";

export function toSdkPolicy(snapshot: PolicySnapshot) {
  const wallet = snapshot.wallet.policy;
  const assignment = snapshot.assignment.policy;
  return {
    maxPerTx: BigInt(wallet.maxPerTxMist) < BigInt(assignment.maxPerTxMist) ? BigInt(wallet.maxPerTxMist) : BigInt(assignment.maxPerTxMist),
    maxPerDay: BigInt(wallet.maxPerDayMist) < BigInt(assignment.maxPerDayMist) ? BigInt(wallet.maxPerDayMist) : BigInt(assignment.maxPerDayMist),
    minRiskScoreToBlock: Math.min(wallet.blockRiskScoreAt, assignment.blockRiskScoreAt),
    requireSim: true,
  };
}

export function jsonSafeReport(report: NormalizedSimulationReport): Record<string, unknown> {
  return { ...report, gasEstimate: report.gasEstimate.toString(), walletBalance: report.walletBalance.toString(), rawEffects: report.rawEffects ?? null };
}

export function simulationBlocks(report: NormalizedSimulationReport, threshold: number) {
  return report.risks.some((risk) => ["SIM_FAILED", "DRAIN_DETECTED"].includes(risk.code))
    || report.recommendation === "abort" || report.riskScore >= threshold;
}
