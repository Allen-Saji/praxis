import { ownerMutation, safeCredential, workspaceRepository } from "@/lib/workspace-mutations.server";

export async function POST(request: Request, context: { params: Promise<{ orgId: string; credentialId: string }> }) {
  const { orgId, credentialId } = await context.params;
  return ownerMutation(request, orgId, async (actorId) => ({ credential: safeCredential(await workspaceRepository().revokeCredential({ organizationId: orgId, actorId, credentialId })) }));
}
