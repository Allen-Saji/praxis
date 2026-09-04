import { z } from "zod";
import { ownerMutation, readJsonBody, workspaceRepository } from "@/lib/workspace-mutations.server";

const bodySchema = z.object({ status: z.enum(["active", "disabled", "archived"]) }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ orgId: string; agentId: string }> }) {
  const { orgId, agentId } = await context.params;
  return ownerMutation(request, orgId, async (actorId) => ({ agent: await workspaceRepository().setAgentStatus({ organizationId: orgId, actorId, agentId, ...await readJsonBody(request, (value) => bodySchema.parse(value)) }) }));
}
