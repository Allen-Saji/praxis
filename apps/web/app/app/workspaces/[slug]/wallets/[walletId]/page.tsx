import Link from "next/link";
import { requireWalletDetail } from "@/lib/workspace-view.server";
import { agentReadiness, assignmentBudget, assignmentTransactionCap, walletBudget } from "@/lib/workspace-model";
import { sui, shortAddress } from "@/lib/workspace-display";
import { StatusAction } from "@/components/workspace/WorkspaceControls";
import { WalletAgentSetup } from "@/components/workspace/WalletAgentSetup";
import { AgentBudget } from "@/components/workspace/AgentBudget";
import { Empty, Panel, StatePill, WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";

export const dynamic = "force-dynamic";
const action = "focus-ring inline-flex min-h-11 items-center rounded border border-[var(--border)] px-3 text-sm text-[var(--accent)]";

export default async function Wallet({ params }: { params: Promise<{ slug: string; walletId: string }> }) {
  const { slug, walletId } = await params;
  const data = await requireWalletDetail(slug, walletId);
  const wallet = data.wallet;
  const scope = data.scopes.find((item) => item.walletId === walletId);
  const canManage = data.member.role === "owner";
  const assigned = data.assignments.filter((item) => data.agents.some((agent) => agent.id === item.agentId));
  const available = data.agents.filter((agent) => agent.status === "active" && !data.assignments.some((item) => item.agentId === agent.id));
  return <WorkspaceFrame slug={slug} name={data.organization.name} title={wallet.label} description="One wallet. Individual agent limits. Every payment also follows the shared wallet policy.">
    <Panel title="Shared wallet" detail="Budgets cover payments. Gas, evidence storage and transfers outside Praxis are separate.">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="font-mono text-sm" title={wallet.suiAddress}>{shortAddress(wallet.suiAddress)}</p><div className="mt-3"><StatePill value={wallet.executionStatus} /></div></div>
        {canManage ? <div className="flex flex-wrap gap-3">
          {scope ? <Link href={`/app/workspaces/${slug}/policies/${scope.id}`} className={action}>{scope.currentVersionId ? "Edit wallet limits" : "Set wallet limits"}</Link> : null}
          <StatusAction endpoint={`/api/workspaces/${data.organization.id}/wallets/${wallet.id}/status`} status={wallet.executionStatus === "enabled" ? "suspended" : "enabled"} label={wallet.executionStatus === "enabled" ? "Pause all agents" : "Enable wallet payments"} danger={wallet.executionStatus === "enabled"} />
        </div> : null}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">{(["day", "month"] as const).map((period) => {
        const budget = walletBudget(data, walletId, period);
        return <div key={period} className="rounded border border-[var(--border)] p-4">
          <h3 className="text-sm text-[var(--text-mid)]">{period === "day" ? "Today" : "This month"}</h3>
          <p className="mt-3 font-mono text-xl">{budget.available === null ? "Set a limit" : `${sui(budget.available)} SUI left`}</p>
          <dl className="mt-4 space-y-2 text-sm">{[["Shared limit", budget.limit], ["Spent", budget.spent], ["Pending", budget.reserved]].map(([label, value]) => <div key={String(label)} className="flex flex-wrap justify-between gap-2"><dt className="text-[var(--text-low)]">{String(label)}</dt><dd className="font-mono">{value === null ? "Not set" : `${sui(value as bigint)} SUI`}</dd></div>)}</dl>
          <p className="mt-4 text-xs text-[var(--text-low)]">Resets {period === "day" ? "daily at 00:00 UTC" : "on the first of the month, 00:00 UTC"}.</p>
        </div>;
      })}</div>
    </Panel>
    <section className="space-y-4" aria-labelledby="wallet-agents-title">
      <div><h2 id="wallet-agents-title" className="font-display text-xl font-semibold">Agents using this wallet <span className="ml-2 font-mono text-sm text-[var(--text-low)]">{assigned.length}</span></h2><p className="mt-2 text-sm leading-6 text-[var(--text-mid)]">Each agent has its own allowance. Everyone shares the wallet's remaining budget; allowances are not reserved balances.</p></div>
      {!assigned.length ? <Empty>No agents have access yet. Add one below to set its individual limits.</Empty> : null}
      {assigned.map((assignment) => {
        const agent = data.agents.find((item) => item.id === assignment.agentId)!;
        const agentScope = data.scopes.find((item) => item.assignmentId === assignment.id);
        const cap = assignmentTransactionCap(data, assignment.id);
        const readiness = agentReadiness(data, agent.id, data.observedAt);
        return <Panel key={assignment.id} title={agent.name} detail={readiness.detail}>
          <div className="flex flex-wrap items-center justify-between gap-3"><StatePill value={agent.status === "active" ? assignment.status : "disabled"} /><p className="text-sm text-[var(--text-mid)]">Per payment: <span className="font-mono text-[var(--text-hi)]">{cap === null ? "Set limits" : `${sui(cap)} SUI`}</span></p></div>
          <div className="my-4 grid gap-3 sm:grid-cols-2"><AgentBudget title="Daily allowance" budget={assignmentBudget(data, assignment.id, "day")} /><AgentBudget title="Monthly allowance" budget={assignmentBudget(data, assignment.id, "month")} /></div>
          <div className="flex flex-wrap gap-3">
            {canManage && agentScope ? <Link className={action} href={`/app/workspaces/${slug}/policies/${agentScope.id}`}>{agentScope.currentVersionId ? "Edit agent limits" : "Review and activate limits"}</Link> : null}
            {canManage && agentScope?.currentVersionId ? <StatusAction endpoint={`/api/workspaces/${data.organization.id}/assignments/${assignment.id}/status`} status={assignment.status === "active" ? "disabled" : "active"} label={assignment.status === "active" ? "Pause access" : "Enable access"} /> : null}
            <Link className={action} href={`/app/workspaces/${slug}/agents/${agent.id}`}>Activity and credentials</Link>
          </div>
        </Panel>;
      })}
    </section>
    {canManage ? <Panel title="Add an agent" detail="Access begins with limits you review and activate.">{scope?.currentVersionId ? <WalletAgentSetup organizationId={data.organization.id} walletId={wallet.id} slug={slug} agents={available.map(({ id, name }) => ({ id, name }))} /> : <p className="text-sm">Set and activate the wallet limits first.</p>}</Panel> : null}
    <details className="rounded border border-[var(--border)] p-4"><summary className="focus-ring cursor-pointer text-sm text-[var(--text-low)]">Wallet details</summary><p className="mt-3 break-all font-mono text-xs">{wallet.suiAddress}</p><p className="mt-3 text-sm">Sui Testnet. Only the configured execution wallet is supported. Pausing prevents new payments; it cannot recall an already submitted transaction.</p></details>
  </WorkspaceFrame>;
}
