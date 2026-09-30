import type { WorkspaceRepository } from "@allen-saji/praxis-db";
export type Overview = NonNullable<Awaited<ReturnType<WorkspaceRepository["workspaceOverview"]>>>;
type AgentReadinessData = Pick<Overview, "agents" | "assignments" | "wallets" | "scopes" | "policyVersions"> & { credentials: Array<Pick<Overview["credentials"][number], "assignmentId" | "revokedAt" | "expiresAt">> };
type WalletBudgetData = Pick<Overview, "scopes" | "policyVersions" | "walletCounters">;
export function agentReadiness(data: AgentReadinessData, agentId: string, now = new Date()) {
  const agent = data.agents.find((item) => item.id === agentId);
  if (!agent || agent.status !== "active") return { label: agent?.status === "archived" ? "Archived" : "Paused", detail: "Agent access is disabled" };
  const assignments = data.assignments.filter((item) => item.agentId === agentId && item.status !== "archived");
  if (!assignments.length) return { label: "Setup needed", detail: "Add wallet access" };
  for (const assignment of assignments) {
    const wallet = data.wallets.find((item) => item.id === assignment.walletId);
    const scopes = data.scopes.filter((item) => item.assignmentId === assignment.id || item.walletId === wallet?.id);
    const activePolicies = scopes.filter((scope) => data.policyVersions.some(({ version }) => version.id === scope.currentVersionId && version.status === "active"));
    const credential = data.credentials.some((item) => item.assignmentId === assignment.id && !item.revokedAt && (!item.expiresAt || item.expiresAt > now));
    if (wallet?.executionStatus === "enabled" && assignment.status === "active" && activePolicies.length === 2 && credential) return { label: "Ready", detail: "Wallet, limits and credential are ready" };
  }
  return { label: "Setup needed", detail: "Review wallet access, limits and credentials" };
}
export function walletBudget(data: WalletBudgetData, walletId: string, period: "day" | "month") {
  const scope = data.scopes.find((item) => item.walletId === walletId);
  const policy = data.policyVersions.find(({ version }) => version.id === scope?.currentVersionId)?.version;
  const counter = data.walletCounters.find((item) => item.wallet.id === walletId && item.counter.periodKind === period)?.counter;
  const spent = BigInt(counter?.spentMist ?? 0); const reserved = BigInt(counter?.reservedMist ?? 0);
  const limit = policy ? BigInt(period === "day" ? policy.maxPerDayMist : policy.maxPerMonthMist) : null;
  return { spent, reserved, limit, available: limit === null ? null : limit > spent + reserved ? limit - spent - reserved : 0n };
}

type AssignmentBudgetData = WalletBudgetData & Pick<Overview, "assignments" | "assignmentCounters">;

/** Individual allowance and shared headroom are caps, never separate balances. */
export function assignmentBudget(data: AssignmentBudgetData, assignmentId: string, period: "day" | "month") {
  const assignment = data.assignments.find((item) => item.id === assignmentId);
  const scope = data.scopes.find((item) => item.assignmentId === assignmentId);
  const policy = data.policyVersions.find(({ version }) => version.id === scope?.currentVersionId && version.status === "active")?.version;
  const counter = data.assignmentCounters.find((item) => item.assignment.id === assignmentId && item.counter.periodKind === period)?.counter;
  const spent = BigInt(counter?.spentMist ?? 0);
  const reserved = BigInt(counter?.reservedMist ?? 0);
  const limit = policy ? BigInt(period === "day" ? policy.maxPerDayMist : policy.maxPerMonthMist) : null;
  const available = limit === null ? null : limit > spent + reserved ? limit - spent - reserved : 0n;
  const shared = assignment ? walletBudget(data, assignment.walletId, period) : null;
  const sharedAvailable = shared?.available ?? null;
  const effectiveAvailable = available === null || sharedAvailable === null ? null : available < sharedAvailable ? available : sharedAvailable;
  return { spent, reserved, limit, available, sharedAvailable, effectiveAvailable, limitedByWallet: available !== null && sharedAvailable !== null && sharedAvailable < available };
}

export function assignmentTransactionCap(data: AssignmentBudgetData, assignmentId: string) {
  const assignment = data.assignments.find((item) => item.id === assignmentId);
  const policyAt = (scopeId?: string) => data.policyVersions.find(({ version }) => version.id === scopeId && version.status === "active")?.version;
  const individual = policyAt(data.scopes.find((item) => item.assignmentId === assignmentId)?.currentVersionId ?? undefined);
  const wallet = policyAt(data.scopes.find((item) => item.walletId === assignment?.walletId)?.currentVersionId ?? undefined);
  if (!individual || !wallet) return null;
  return BigInt(individual.maxPerTxMist) < BigInt(wallet.maxPerTxMist) ? BigInt(individual.maxPerTxMist) : BigInt(wallet.maxPerTxMist);
}
