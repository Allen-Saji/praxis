import Link from "next/link";
import { ArrowRight, Bot } from "lucide-react";
import { requireWorkspaceOverview } from "@/lib/workspace-view.server";
import { CreateAgentForm } from "@/components/workspace/WorkspaceControls";
import { Empty, Panel, StatePill, WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";

export const dynamic = "force-dynamic";
export default async function AgentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const data = await requireWorkspaceOverview(slug);
  return <WorkspaceFrame slug={slug} name={data.organization.name} eyebrow="Delegated identities" title="Agents" description="Each agent receives an isolated assignment policy, budget counters, and revocable credential.">
    <div className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]"><Panel title="Create agent"><CreateAgentForm organizationId={data.organization.id} /></Panel><Panel title="Agent registry" detail={`${data.agents.length} identities in this workspace`}>{data.agents.length ? <div className="grid gap-3 sm:grid-cols-2">{data.agents.map((agent) => { const assignments = data.assignments.filter((x) => x.agentId === agent.id); return <Link key={agent.id} href={`/app/workspaces/${slug}/agents/${agent.id}`} className="focus-ring group rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] p-4 hover:border-[var(--accent)]/40"><div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded border border-[var(--border-hi)]"><Bot className="h-4 w-4 text-[var(--accent)]" /></span><StatePill value={agent.status} /></div><h2 className="mt-4 font-semibold">{agent.name}</h2><p className="mt-1 truncate font-mono text-[11px] text-[var(--text-low)]">{agent.externalRef}</p><div className="mt-4 flex min-h-11 items-center justify-between border-t border-[var(--divider)] pt-3 text-[12px] text-[var(--text-mid)]"><span>{assignments.length} assignment{assignments.length === 1 ? "" : "s"}</span><ArrowRight className="h-4 w-4 group-hover:text-[var(--accent)]" /></div></Link>; })}</div> : <Empty>No agents registered.</Empty>}</Panel></div>
  </WorkspaceFrame>;
}
