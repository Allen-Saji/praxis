import { ownerMutation } from "@/lib/workspace-mutations.server";
import { activateVaultAssignment } from "@/lib/vault-activation.server";
export async function POST(request: Request, context: { params: Promise<{ orgId: string; assignmentId: string }> }) {
  const { orgId, assignmentId } = await context.params;
  return ownerMutation(request, orgId, (actorId) => activateVaultAssignment({ organizationId: orgId, actorId, assignmentId }));
}
