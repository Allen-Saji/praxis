import type { WorkspaceRepository } from "@allen-saji/praxis-db";
export type Overview = NonNullable<Awaited<ReturnType<WorkspaceRepository["workspaceOverview"]>>>;
export function agentReadiness(data: Overview, agentId: string, now = new Date()) {
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
export function walletBudget(data: Overview, walletId: string, period: "day" | "month") {
  const scope = data.scopes.find((item) => item.walletId === walletId);
  const policy = data.policyVersions.find(({ version }) => version.id === scope?.currentVersionId)?.version;
  const counter = data.walletCounters.find((item) => item.wallet.id === walletId && item.counter.periodKind === period)?.counter;
  const spent = BigInt(counter?.spentMist ?? 0); const reserved = BigInt(counter?.reservedMist ?? 0);
  const limit = policy ? BigInt(period === "day" ? policy.maxPerDayMist : policy.maxPerMonthMist) : null;
  return { spent, reserved, limit, available: limit === null ? null : limit > spent + reserved ? limit - spent - reserved : 0n };
}
