import { notFound } from "next/navigation";
import { requireWorkspaceOverview } from "@/lib/workspace-view.server";
import { PolicyEditor, PolicySummary } from "@/components/workspace/PolicyEditor";
import { Panel, WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
export const dynamic = "force-dynamic";
export default async function PolicyPage({ params }: { params: Promise<{ slug: string; scopeId: string }> }) {
  const { slug, scopeId } = await params; const data = await requireWorkspaceOverview(slug); const scope = data.scopes.find((item) => item.id === scopeId); if (!scope) notFound();
  const versions = data.policyVersions.filter((item) => item.scope.id === scope.id).map((item) => item.version); const active = versions.find((item) => item.id === scope.currentVersionId) ?? null;
  const name = scope.walletId ? data.wallets.find((item) => item.id === scope.walletId)?.label : data.agents.find((item) => data.assignments.some((assignment) => assignment.id === scope.assignmentId && assignment.agentId === item.id))?.name;
  return <WorkspaceFrame slug={slug} name={data.organization.name} title={`${name ?? "Agent"} limits`} description="Review changes before activating them.">
    {active ? <Panel title="Active limits"><PolicySummary policy={active} /></Panel> : null}
    <PolicyEditor key={active?.id ?? scope.id} organizationId={data.organization.id} scopeId={scope.id} versions={versions} active={active} />
  </WorkspaceFrame>;
}
