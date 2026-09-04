import { z } from "zod";
import { ownerMutation, readJsonBody, workspaceRepository } from "@/lib/workspace-mutations.server";

const bodySchema = z.object({ walletId: z.string().uuid(), agentId: z.string().uuid() }).strict();

export async function POST(request: Request, context: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await context.params;
  return ownerMutation(request, orgId, async (actorId) => workspaceRepository().createAssignment({ organizationId: orgId, actorId, ...await readJsonBody(request, (value) => bodySchema.parse(value)) }));
}
