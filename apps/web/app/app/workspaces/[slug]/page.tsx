import Link from "next/link";
import { RefreshActivity } from "@/components/workspace/RefreshActivity";
import { requireWorkspaceOverview } from "@/lib/workspace-view.server";
import { agentReadiness, walletBudget } from "@/lib/workspace-model";
import { sui } from "@/lib/workspace-display";
import { Panel, WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { ActivityList } from "@/components/workspace/ActivityList";
export const dynamic = "force-dynamic";
export default async function Dashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const data = await requireWorkspaceOverview(slug); const base = `/app/workspaces/${slug}`;
  const budgets = data.wallets.map((wallet) => walletBudget(data, wallet.id, "day"));
  const reserved = budgets.reduce((sum, budget) => sum + budget.reserved, 0n);
  const available = budgets.filter((budget) => budget.available !== null).reduce((sum, budget) => sum + budget.available!, 0n);
  const ready = data.agents.filter((agent) => agentReadiness(data, agent.id).label === "Ready").length;
  const setup = !data.wallets.length ? { title: "Add your first wallet", detail: "Check execution eligibility and set spending limits.", href: `${base}/wallets` } : !data.scopes.some((scope) => scope.walletId && scope.currentVersionId) ? { title: "Set wallet spending limits", detail: "Review and activate a policy before granting agent access.", href: `${base}/wallets` } : !data.agents.length ? { title: "Add your first agent", detail: "Give it wallet access and its own allowance.", href: `${base}/agents` } : !ready ? { title: "Finish agent setup", detail: "Enable wallet access, activate limits and issue a credential.", href: `${base}/agents` } : null;
  return <WorkspaceFrame slug={slug} name={data.organization.name} title="Dashboard" description="">
    <div className="flex items-center justify-between text-xs text-[var(--text-low)]"><span>Today, UTC</span><div className="flex items-center gap-4"><RefreshActivity /><Link className="focus-ring min-h-11 content-center text-[var(--accent)]" href={`${base}/decisions`}>View activity</Link></div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      ["Spent today", `${sui(data.totals.spentToday)} SUI`],
      ["Available today", budgets.some((budget) => budget.limit !== null) ? `${sui(available)} SUI` : "Set a budget"],
      ["Pending spend", `${sui(reserved)} SUI`],
      ["Blocked today", String(data.totals.blockedToday)],
    ].map(([label, value]) => <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5"><p className="text-xs text-[var(--text-low)]">{label}</p><p className="mt-3 break-words font-mono text-xl font-semibold">{value}</p></div>)}</div>
    {data.totals.uncertain || data.totals.pending ? <Panel title="Needs attention"><p className="text-sm leading-6">{data.totals.uncertain ? `${data.totals.uncertain} request(s) awaiting a confirmed chain outcome. Do not retry these payments. ` : ""}{data.totals.pending ? `${data.totals.pending} request(s) awaiting evidence or an audit record.` : ""}</p><Link href={`${base}/decisions?${data.totals.uncertain ? "state=submission_unknown" : "attention=1"}`} className="focus-ring mt-3 inline-flex min-h-11 items-center text-sm text-[var(--accent)]">Review activity</Link></Panel> : null}
    {setup ? <Panel title={setup.title}><p className="text-sm text-[var(--text-mid)]">{setup.detail}</p><Link href={setup.href} className="focus-ring mt-4 inline-flex min-h-11 items-center rounded bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--bg)]">Continue setup</Link></Panel> : null}
    <Panel title="Recent activity"><ActivityList slug={slug} decisions={data.decisions.slice(0, 8)} agents={data.agents} /></Panel>
  </WorkspaceFrame>;
}
