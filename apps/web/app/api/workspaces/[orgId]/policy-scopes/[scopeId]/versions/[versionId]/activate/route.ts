import { assertEditablePolicyScope, ownerMutation, policyRepository } from "@/lib/workspace-mutations.server";

export async function POST(request: Request, context: { params: Promise<{ orgId: string; scopeId: string; versionId: string }> }) {
  const { orgId, scopeId, versionId } = await context.params;
  return ownerMutation(request, orgId, async (actorId) => { await assertEditablePolicyScope(orgId, actorId, scopeId); return { policyVersion: await policyRepository().activate({ organizationId: orgId, scopeId, versionId, actorId }) }; });
}
