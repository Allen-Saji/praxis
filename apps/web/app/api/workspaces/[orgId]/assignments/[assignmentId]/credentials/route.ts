import { z } from "zod";
import { issueCredential, ownerMutation, readJsonBody } from "@/lib/workspace-mutations.server";

const bodySchema = z.object({ name: z.string().trim().min(1).max(64), expiresAt: z.string().datetime().nullable().optional() }).strict();

export async function POST(request: Request, context: { params: Promise<{ orgId: string; assignmentId: string }> }) {
  const { orgId, assignmentId } = await context.params;
  const response = await ownerMutation(request, orgId, async (actorId) => {
    const body = await readJsonBody(request, (value) => bodySchema.parse(value));
    return issueCredential({ organizationId: orgId, actorId, assignmentId, name: body.name, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null });
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
