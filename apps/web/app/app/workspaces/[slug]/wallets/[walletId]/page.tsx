import { createHash } from "node:crypto";
import { VaultAgentControls } from "@/components/workspace/VaultAgentControls";
import { makeSuiClient, readVaultState, readVaultGrant } from "@allen-saji/praxis";
import { VaultOwnerControls } from "@/components/workspace/VaultOwnerControls";
import { vaultPackageId } from "@/lib/vault-config.server";
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
  if (wallet.adapterType === "delegated_vault") {
    const packageId = vaultPackageId();
    if (wallet.vaultPackageId !== packageId) throw new Error("Vault belongs to a different deployment");
    const state = await readVaultState(makeSuiClient("testnet"), { packageId, vaultId: wallet.suiAddress });
    if (state.owner !== wallet.vaultOwnerAddress) throw new Error("Vault owner does not match registration");
    const grants = await Promise.all(data.assignments.filter((row) => row.walletId === walletId && row.status !== "archived").map(async (row) => {
      const agent = `0x${createHash("sha256").update(row.agentId).digest("hex")}`;
      try { return { row, agent, hasGrant: true as boolean | null, grant: await readVaultGrant(makeSuiClient("testnet"), packageId, state, agent) }; }
      catch (error) {
        const missing = error && typeof error === "object" && "code" in error && ["notExists", "dynamicFieldNotFound"].includes(String(error.code));
        return { row, agent, hasGrant: state.grants.size === "0" || missing ? false : null, grant: null };
      }
    }));
    return <WorkspaceFrame slug={slug} name={data.organization.name} title={wallet.label} description="Funds and permissions controlled by your Sui wallet.">
      <Panel title="Spending vault" detail="Sui Testnet">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-[var(--text-low)]">Vault balance</dt><dd className="mt-2 font-mono text-xl">{sui(state.funds)} SUI</dd></div>
          <div><dt className="text-[var(--text-low)]">Agent payments</dt><dd className="mt-2">{state.paused ? "Paused on-chain" : "Allowed within active grants"}</dd></div>
          <div><dt className="text-[var(--text-low)]">Total spent / allowance</dt><dd className="mt-2 font-mono">{sui(state.spent)} / {sui(state.allowance)} SUI</dd></div>
          <div><dt className="text-[var(--text-low)]">Daily / monthly ceilings</dt><dd className="mt-2 font-mono">{sui(state.budget.daily_limit)} / {sui(state.budget.monthly_limit)} SUI</dd></div>
        </dl>
        <p className="mt-5 break-all font-mono text-xs text-[var(--text-low)]">Vault: {wallet.suiAddress}</p>
        <p className="mt-2 break-all font-mono text-xs text-[var(--text-low)]">Owner: {state.owner}</p>
      </Panel>
      {data.member.role === "owner" && data.session.user.primarySuiAddress === state.owner ? <Panel title="Manage your funds"><VaultOwnerControls packageId={packageId} vaultId={wallet.suiAddress} owner={state.owner} paused={state.paused} /></Panel> : null}
      <Panel title="Agent access"><p className="text-sm text-[var(--text-mid)]">Hosted execution is not active for this vault yet. Owner funding, withdrawal and on-chain controls are available.</p></Panel>
      {data.member.role === "owner" ? <Panel title="Add an agent"><WalletAgentSetup organizationId={data.organization.id} walletId={walletId} slug={slug} vaultMode agents={data.agents.filter((agent) => agent.status === "active" && !grants.some(({ row }) => row.agentId === agent.id))} /></Panel> : null}
      {grants.map(({ row, agent, grant, hasGrant }) => <Panel key={row.id} title={data.agents.find((item) => item.id === row.agentId)?.name ?? "Agent"}>
        <p className="mb-4 text-sm text-[var(--text-mid)]">{grant ? `On-chain access ${grant.active ? "enabled" : "revoked"}. Expires ${new Date(Number(grant.expires_ms)).toISOString()}. Total spent: ${sui(grant.spent)} SUI.` : hasGrant === false ? "No on-chain authorization yet." : "Could not verify this agent's grant. Refresh before changing access."}</p>
        {data.member.role === "owner" && data.session.user.primarySuiAddress === state.owner ? <VaultAgentControls organizationId={data.organization.id} assignmentId={row.id} packageId={packageId} vaultId={wallet.suiAddress} owner={state.owner} agent={agent} hasGrant={hasGrant} /> : null}
      </Panel>)}
    </WorkspaceFrame>;
  }
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
