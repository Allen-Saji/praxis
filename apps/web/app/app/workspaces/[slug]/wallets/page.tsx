import Link from "next/link";
import { requireWorkspaceOverview } from "@/lib/workspace-view.server";
import { walletBudget } from "@/lib/workspace-model";
import { shortAddress, sui } from "@/lib/workspace-display";
import { RegisterWalletForm } from "@/components/workspace/WorkspaceControls";
import { Panel, StatePill, WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
export const dynamic = "force-dynamic";
export default async function Wallets({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const data = await requireWorkspaceOverview(slug);
  return <WorkspaceFrame slug={slug} name={data.organization.name} title="Wallets" description="Shared spending limits for your agents.">
    {data.wallets.map((wallet) => { const budget = walletBudget(data, wallet.id, "day"); return <Link key={wallet.id} href={`/app/workspaces/${slug}/wallets/${wallet.id}`} className="focus-ring flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5"><span><span className="block font-semibold">{wallet.label}</span><span className="mt-2 block font-mono text-xs text-[var(--text-low)]">{shortAddress(wallet.suiAddress)}</span></span><span className="text-sm">{budget.available === null ? "Set spending limits" : `${sui(budget.available)} SUI available today`}</span><StatePill value={wallet.executionStatus} /></Link>; })}
    {!data.wallets.length ? <Panel title="Add a wallet"><RegisterWalletForm organizationId={data.organization.id} /></Panel> : <details className="rounded-xl border border-[var(--border)] p-5"><summary className="focus-ring cursor-pointer text-sm font-medium">Add wallet</summary><div className="mt-5 max-w-lg"><RegisterWalletForm organizationId={data.organization.id} /></div></details>}
  </WorkspaceFrame>;
}
