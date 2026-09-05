import Link from "next/link";
import { requireOwnerSession } from "@/lib/workspace-view.server";
import { WorkspaceCreateForm } from "@/components/workspace/WorkspaceControls";
import { Panel } from "@/components/workspace/WorkspaceFrame";

export const dynamic = "force-dynamic";
export default async function NewWorkspacePage() {
  await requireOwnerSession();
  return <div className="mx-auto max-w-2xl space-y-6 py-6"><Link href="/app/workspaces" className="focus-ring inline-flex min-h-11 items-center text-[13px] text-[var(--text-mid)] hover:text-[var(--text-hi)]">Back to workspaces</Link><header><p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]"></p><h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.04em]">New workspace</h1><p className="mt-2 text-[13px] text-[var(--text-mid)]">Your agents and activity stay in this workspace.</p></header><Panel title="Workspace identity" ><WorkspaceCreateForm /></Panel></div>;
}
