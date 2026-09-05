import Link from "next/link";
import { requireWorkspaceOverview } from "@/lib/workspace-view.server";
import { agentReadiness } from "@/lib/workspace-model";
import { dateLabel, sui } from "@/lib/workspace-display";
import { CreateAgentForm } from "@/components/workspace/WorkspaceControls";
import { Empty, Panel, WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
export const dynamic = "force-dynamic";
export default async function Agents({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const data = await requireWorkspaceOverview(slug);
  return <WorkspaceFrame slug={slug} name={data.organization.name} title="Agents" description="Only agents registered in this workspace.">
    <details open={!data.agents.length} className="max-w-xl rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5"><summary className="focus-ring cursor-pointer text-sm font-semibold">Add agent</summary><div className="mt-5"><CreateAgentForm organizationId={data.organization.id} /></div></details>
    <Panel title="Your agents">{data.agents.length ? <div className="grid gap-3">{data.agents.map((agent) => {
      const readiness = agentReadiness(data, agent.id); const assignments = data.assignments.filter((item) => item.agentId === agent.id);
      const lastUsed = data.credentials.filter((item) => assignments.some((a) => a.id === item.assignmentId) && item.lastUsedAt).map((item) => item.lastUsedAt!).sort((a, b) => b.getTime() - a.getTime())[0];
      const scopes = data.scopes.filter((scope) => assignments.some((a) => a.id === scope.assignmentId));
      const limits = data.policyVersions.filter(({ version }) => scopes.some((scope) => scope.currentVersionId === version.id));
      return <Link key={agent.id} href={`/app/workspaces/${slug}/agents/${agent.id}`} className="focus-ring grid gap-4 rounded-lg border border-[var(--border)] p-4 hover:border-[var(--border-hi)] sm:grid-cols-[1fr_1fr_auto]"><span><span className="block font-semibold">{agent.name}</span><span className="mt-1 block text-xs text-[var(--text-low)]">{assignments.map((a) => data.wallets.find((wallet) => wallet.id === a.walletId)?.label).filter(Boolean).join(", ") || "No wallet access"}</span></span><span className="text-sm"><span className="block">{limits.length ? `${sui(limits.reduce((sum, { version }) => sum + BigInt(version.maxPerDayMist), 0n))} SUI / day` : "Limits not set"}</span><span className="mt-1 block text-xs text-[var(--text-low)]">{lastUsed ? `Last request ${dateLabel(lastUsed)}` : "No requests yet"}</span></span><span title={readiness.detail} className={`text-sm ${readiness.label === "Ready" ? "text-[var(--risk-low)]" : "text-[var(--text-mid)]"}`}>{readiness.label}</span></Link>;
    })}</div> : <Empty>Add your first agent to give it a spending allowance.</Empty>}</Panel>
  </WorkspaceFrame>;
}
