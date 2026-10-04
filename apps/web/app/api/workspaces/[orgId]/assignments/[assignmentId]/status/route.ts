import { activateVaultAssignment } from "@/lib/vault-activation.server";
import { z } from "zod";
import { ownerMutation, readJsonBody, workspaceRepository } from "@/lib/workspace-mutations.server";

const bodySchema = z.object({ status: z.enum(["active", "disabled", "archived"]) }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ orgId: string; assignmentId: string }> }) {
  const { orgId, assignmentId } = await context.params;
  return ownerMutation(request, orgId, async (actorId) => {
    const body = await readJsonBody(request, (value) => bodySchema.parse(value));
    if (body.status === "active") {
      const row = await workspaceRepository().assignmentExecutionForMember(orgId, actorId, assignmentId);
      if (row?.wallet.adapterType === "delegated_vault") return activateVaultAssignment({ organizationId: orgId, actorId, assignmentId });
    }
    return { assignment: await workspaceRepository().setAssignmentStatus({ organizationId: orgId, actorId, assignmentId, ...body }) };
  });
}
