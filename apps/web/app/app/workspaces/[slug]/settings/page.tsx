import { LockKeyhole, ServerCog, Wallet } from "lucide-react";
import { requireWorkspaceOverview } from "@/lib/workspace-view.server";
import { LogoutButton } from "@/components/workspace/WorkspaceControls";
import { Panel, WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";

export const dynamic = "force-dynamic";
export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const data = await requireWorkspaceOverview(slug);
  return <WorkspaceFrame slug={slug} name={data.organization.name} eyebrow="Workspace settings" title="Security boundary" description="Phase 1 configuration is deliberately narrow: one Testnet execution wallet, owner-authenticated mutations, and append-only operational history.">
    <div className="grid gap-5 lg:grid-cols-3"><Panel title="Owner session"><IconText icon={Wallet} title="Signed owner" text={data.session.user.primarySuiAddress} /><div className="mt-4"><LogoutButton /></div></Panel><Panel title="Network"><IconText icon={ServerCog} title="Sui Testnet" text="Mainnet cannot be selected or activated in Phase 1." /></Panel><Panel title="Custody"><IconText icon={LockKeyhole} title="Demo keypair adapter" text="Production isolated custody and multi-wallet Move authorization remain explicit Phase 2 gates." /></Panel></div>
    <Panel title="Lifecycle controls" detail="Destructive removal is intentionally unavailable."><p className="text-[13px] leading-6 text-[var(--text-mid)]">Use precise suspend, disable, archive, and revoke actions on the relevant wallet, agent, assignment, or credential. Decisions, evidence references, counters, policy hashes, and audit events remain retained for review.</p></Panel>
  </WorkspaceFrame>;
}
function IconText({ icon: Icon, title, text }: { icon: typeof Wallet; title: string; text: string }) { return <div><Icon className="h-5 w-5 text-[var(--accent)]" /><p className="mt-4 text-[13px] font-semibold">{title}</p><p className="mt-2 break-all font-mono text-[11px] leading-5 text-[var(--text-low)]">{text}</p></div>; }
