import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspaceOverview } from "@/lib/workspace-view.server";
import { PolicyEditor, PolicySummary } from "@/components/workspace/PolicyEditor";
import { Panel, WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
export const dynamic = "force-dynamic";
export default async function PolicyPage({ params }: { params: Promise<{ slug: string; scopeId: string }> }) {
  const { slug, scopeId } = await params; const data = await requireWorkspaceOverview(slug); const scope = data.scopes.find((item) => item.id === scopeId); if (!scope) notFound();
  const versions = data.policyVersions.filter((item) => item.scope.id === scope.id).map((item) => item.version); const active = versions.find((item) => item.id === scope.currentVersionId) ?? null;
  const name = scope.walletId ? data.wallets.find((item) => item.id === scope.walletId)?.label : data.agents.find((item) => data.assignments.some((assignment) => assignment.id === scope.assignmentId && assignment.agentId === item.id))?.name;
  const assignment = data.assignments.find((item) => item.id === scope.assignmentId);
  const walletScope = assignment ? data.scopes.find((item) => item.walletId === assignment.walletId) : null;
  const walletPolicy = data.policyVersions.find(({ version }) => version.id === walletScope?.currentVersionId)?.version;
  return <WorkspaceFrame slug={slug} name={data.organization.name} title={`${name ?? "Agent"} limits`} description="Review changes before activating them.">
    {assignment ? <><Link href={`/app/workspaces/${slug}/agents/${assignment.agentId}`} className="focus-ring inline-flex min-h-11 items-center text-sm text-[var(--accent)]">Continue to agent access and credentials</Link><p className="text-sm leading-6 text-[var(--text-mid)]">Activate these limits, then enable this agent's wallet access and issue its credential. The shared wallet policy always applies too.</p>{walletPolicy ? <details className="rounded border border-[var(--border)] p-4"><summary className="focus-ring cursor-pointer text-sm">Shared wallet limits</summary><div className="mt-4"><PolicySummary policy={walletPolicy} /></div></details> : null}</> : <Link href={`/app/workspaces/${slug}/wallets/${scope.walletId}`} className="focus-ring inline-flex min-h-11 items-center text-sm text-[var(--accent)]">Back to wallet and agents</Link>}
    {active ? <Panel title="Active limits"><PolicySummary policy={active} /></Panel> : null}
    <PolicyEditor key={active?.id ?? scope.id} organizationId={data.organization.id} scopeId={scope.id} versions={versions} active={active} />
  </WorkspaceFrame>;
}
