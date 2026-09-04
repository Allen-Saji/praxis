import { z } from "zod";
import { ownerMutation, readJsonBody, workspaceRepository } from "@/lib/workspace-mutations.server";

const bodySchema = z.object({ name: z.string().trim().min(1).max(64), externalRef: z.string().trim().min(1).max(128) }).strict();

export async function POST(request: Request, context: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await context.params;
  return ownerMutation(request, orgId, async (actorId) => ({ agent: await workspaceRepository().createAgent({ organizationId: orgId, actorId, ...await readJsonBody(request, (value) => bodySchema.parse(value)) }) }));
}
