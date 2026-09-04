import Link from "next/link";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { currentOwnerSession } from "@/lib/workspace-view.server";
import { workspaceRepository } from "@/lib/control-plane.server";
import { OwnerSignIn } from "@/components/workspace/WorkspaceControls";
import { Empty, Panel, StatePill } from "@/components/workspace/WorkspaceFrame";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const session = await currentOwnerSession();
  if (!session) return <div className="mx-auto max-w-xl space-y-6 py-8 sm:py-16">
    <div><p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">Owner control plane</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Authorize the operator.</h1><p className="mt-3 text-[14px] leading-6 text-[var(--text-mid)]">Connect the owner wallet to manage isolated spending authority, policy envelopes, credentials, and recovery state.</p></div>
    <Panel title="Sui owner sign-in" detail="Testnet identity only. No transaction is created."><OwnerSignIn /></Panel>
    <div className="flex items-center gap-2 text-[12px] text-[var(--text-low)]"><ShieldCheck className="h-4 w-4 text-[var(--risk-low)]" />Session credentials stay in a secure HTTP-only cookie.</div>
  </div>;
  const workspaces = await workspaceRepository().listForUser(session.user.id);
  return <div className="space-y-7 pb-24 md:pb-8">
    <header className="flex flex-col justify-between gap-4 border-b border-[var(--divider)] pb-5 sm:flex-row sm:items-end"><div><p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]">Owner control plane</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.04em]">Workspaces</h1><p className="mt-2 text-[13px] text-[var(--text-mid)]">Testnet execution domains available to this owner.</p></div><Link className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--r-sm)] bg-[var(--accent)] px-4 text-[13px] font-semibold text-[var(--bg)]" href="/app/workspaces/new">New workspace <ArrowRight className="h-4 w-4" /></Link></header>
    {workspaces.length ? <div className="grid gap-4 md:grid-cols-2">{workspaces.map(({ organization, role }) => <Link key={organization.id} href={`/app/workspaces/${organization.slug}`} className="evidence-surface focus-ring group min-w-0 rounded-[var(--r-md)] p-5 transition-colors hover:border-[var(--accent)]/40">
      <div className="flex items-start justify-between gap-4"><span className="grid h-11 w-11 place-items-center rounded-[var(--r-sm)] border border-[var(--border-hi)] bg-[var(--panel-2)]"><Building2 className="h-5 w-5 text-[var(--accent)]" /></span><StatePill value={organization.network} /></div>
      <h2 className="mt-5 font-display text-xl font-semibold">{organization.name}</h2><p className="mt-1 font-mono text-[11px] text-[var(--text-low)]">/{organization.slug}</p><div className="mt-5 flex items-center justify-between border-t border-[var(--divider)] pt-4 text-[12px] text-[var(--text-mid)]"><span>{role}</span><span className="group-hover:text-[var(--accent)]">Open command deck</span></div>
    </Link>)}</div> : <Empty>No workspaces yet. Create one to establish the first Testnet policy boundary.</Empty>}
  </div>;
}
