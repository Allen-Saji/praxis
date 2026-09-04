import { authorizeAgentRequest } from "@/lib/agent-auth.server";
import { intentRepository, safeErrorResponse } from "@/lib/control-plane.server";
import { safeIntent } from "@/lib/spend.server";

export async function GET(request: Request, context: { params: Promise<{ intentId: string }> }) {
  try {
    const authorized = await authorizeAgentRequest(request);
    const { intentId } = await context.params;
    const intent = await intentRepository().byCredential(authorized.credential.id, intentId);
    if (!intent) return Response.json({ error: { code: "INTENT_NOT_FOUND", message: "Intent was not found", requestId: crypto.randomUUID() } }, { status: 404 });
    return Response.json(safeIntent(intent), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error, "INTENT_LOOKUP_FAILED", 400);
  }
}
