import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace-view.server";
import { Panel, WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
export const dynamic = "force-dynamic";
export default async function Settings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const data = await requireWorkspace(slug);
  return <WorkspaceFrame slug={slug} name={data.organization.name} title="Settings" description="Workspace and account information.">
    <Panel title="Workspace"><dl className="grid gap-4 text-sm"><div><dt className="text-[var(--text-low)]">Name</dt><dd className="mt-1">{data.organization.name}</dd></div><div><dt className="text-[var(--text-low)]">Your role</dt><dd className="mt-1">{data.member.role}</dd></div></dl><div className="mt-5 flex flex-wrap gap-4"><Link className="focus-ring inline-flex min-h-11 items-center text-sm text-[var(--accent)]" href="/app/workspaces">Manage workspaces</Link><Link className="focus-ring inline-flex min-h-11 items-center text-sm text-[var(--accent)]" href="/app/workspaces/new">New workspace</Link></div></Panel>
    <Panel title="Privacy and network"><p className="text-sm leading-7 text-[var(--text-mid)]">Your workspace is accessible only to its members. Sui transactions and published Walrus evidence are public. Hosted payments currently support Sui Testnet and the configured execution wallet.</p></Panel>
  </WorkspaceFrame>;
}
