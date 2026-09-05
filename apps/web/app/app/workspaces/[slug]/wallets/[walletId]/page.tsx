import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspaceOverview } from "@/lib/workspace-view.server";
import { walletBudget } from "@/lib/workspace-model";
import { sui } from "@/lib/workspace-display";
import { StatusAction } from "@/components/workspace/WorkspaceControls";
import { Panel, StatePill, WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
export const dynamic = "force-dynamic";
export default async function Wallet({ params }: { params: Promise<{ slug: string; walletId: string }> }) {
  const { slug, walletId } = await params; const data = await requireWorkspaceOverview(slug); const wallet = data.wallets.find((item) => item.id === walletId); if (!wallet) notFound();
  const scope = data.scopes.find((item) => item.walletId === walletId);
  return <WorkspaceFrame slug={slug} name={data.organization.name} title={wallet.label} description="Shared by agents with access to this wallet.">
    <Panel title="Wallet"><p className="mb-4 break-all font-mono text-sm">{wallet.suiAddress}</p><div className="flex flex-wrap items-center gap-3"><StatePill value={wallet.executionStatus} />{scope ? <Link href={`/app/workspaces/${slug}/policies/${scope.id}`} className="focus-ring inline-flex min-h-11 items-center rounded border border-[var(--border)] px-3 text-sm text-[var(--accent)]">{scope.currentVersionId ? "Edit spending limits" : "Set spending limits"}</Link> : null}<StatusAction endpoint={`/api/workspaces/${data.organization.id}/wallets/${wallet.id}/status`} status={wallet.executionStatus === "enabled" ? "suspended" : "enabled"} label={wallet.executionStatus === "enabled" ? "Pause payments" : "Enable payments"} danger={wallet.executionStatus === "enabled"} /></div><p className="mt-3 text-sm text-[var(--text-low)]">Enabling checks the configured Testnet signer. Pausing prevents new payments.</p></Panel>
    <div className="grid gap-4 sm:grid-cols-2">{(["day", "month"] as const).map((period) => { const budget = walletBudget(data, walletId, period); return <Panel key={period} title={period === "day" ? "Today's budget" : "This month's budget"}><dl className="grid gap-3 text-sm">{[["Spent", budget.spent], ["Pending", budget.reserved], ["Available", budget.available], ["Limit", budget.limit]].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-3"><dt className="text-[var(--text-mid)]">{String(label)}</dt><dd className="font-mono">{value === null ? "Not set" : `${sui(value as bigint)} SUI`}</dd></div>)}</dl><p className="mt-5 text-xs text-[var(--text-low)]">Resets {period === "day" ? "at 00:00 UTC each day" : "on the first day of each month, 00:00 UTC"}.</p></Panel>; })}</div>
    <details className="rounded border border-[var(--border)] p-4"><summary className="focus-ring cursor-pointer text-sm text-[var(--text-low)]">Technical details</summary><p className="mt-3 text-sm">Network: Sui Testnet. Adapter: {wallet.adapterType}.</p></details>
  </WorkspaceFrame>;
}
