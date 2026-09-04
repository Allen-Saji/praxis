import { z } from "zod";
import { ownerMutation, readJsonBody, workspaceRepository } from "@/lib/workspace-mutations.server";

const bodySchema = z.object({ status: z.enum(["active", "disabled", "archived"]) }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ orgId: string; assignmentId: string }> }) {
  const { orgId, assignmentId } = await context.params;
  return ownerMutation(request, orgId, async (actorId) => ({ assignment: await workspaceRepository().setAssignmentStatus({ organizationId: orgId, actorId, assignmentId, ...await readJsonBody(request, (value) => bodySchema.parse(value)) }) }));
}
