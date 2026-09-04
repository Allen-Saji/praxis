import { z } from "zod";
import { readJsonBody, requireSameOrigin, requireSession, safeErrorResponse, workspaceRepository } from "@/lib/control-plane.server";
export const dynamic = "force-dynamic";
const schema = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/), name: z.string().trim().min(1).max(80) }).strict();
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await requireSession(request);
    const body = await readJsonBody(request, (value) => schema.parse(value));
    const organization = await workspaceRepository().createOrganization({ ...body, userId: session.user.id });
    return Response.json({ organization }, { status: 201 });
  } catch (error) {
    return safeErrorResponse(error, "INVALID_WORKSPACE_REQUEST", 400);
  }
}
