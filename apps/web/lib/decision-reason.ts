export function budgetViolation(code: string | null) {
  const match = /^(WALLET|ASSIGNMENT)_(DAY|MONTH)_BUDGET_EXCEEDED$/.exec(code ?? "");
  return match ? { scope: match[1] === "WALLET" ? "wallet" as const : "agent" as const, period: match[2] === "DAY" ? "day" as const : "month" as const } : null;
}

export function decisionReason(code: string | null) {
  const budget = budgetViolation(code);
  if (budget) return `${budget.scope === "wallet" ? "The shared wallet" : "This agent"} has insufficient ${budget.period === "day" ? "daily" : "monthly"} allowance. Pending payments also count toward the limit.`;
  switch (code) {
    case "POLICY_BLOCKED": return "The amount or recipient is outside the active wallet or agent policy.";
    case "DRAIN_DETECTED": return "Simulation found that this payment would drain most of the wallet.";
    case "POLICY_CHANGED_BEFORE_SIGN": return "The policy changed before signing. Review the new limits before requesting another payment.";
    case "PRESIGN_REVALIDATION_FAILED": return "Agent or wallet access changed before signing.";
    case "SIM_FAILED": case "SIMULATION_FAILED": return "Simulation could not establish a safe payment outcome.";
    default: return code ? code.replaceAll("_", " ").toLowerCase() : "Policy or simulation checks did not pass.";
  }
}
