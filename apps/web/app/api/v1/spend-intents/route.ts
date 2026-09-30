import { readSpendRequest } from "@/lib/spend-request.server";
import { authorizeAgentRequest } from "@/lib/agent-auth.server";
import { HttpError, safeErrorResponse } from "@/lib/control-plane.server";
import { createAndProcessSpend, safeIntent } from "@/lib/spend.server";

export async function POST(request: Request) {
  try {
    const context = await authorizeAgentRequest(request);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !/^[\x20-\x7e]+$/.test(idempotencyKey)) throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8 to 128 printable ASCII characters");
    const body = await readSpendRequest(request);
    const result = await createAndProcessSpend({ context, idempotencyKey, request: { ...body, privacy: "public" } });
    if (result.kind === "conflict") throw new HttpError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused with different content");
    const terminal = ["confirmed", "blocked", "failed", "expired"].includes(result.intent.state);
    return Response.json(safeIntent(result.intent), { status: result.kind === "existing" ? 200 : terminal ? 201 : 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = safeErrorResponse(error, "SPEND_INTENT_REJECTED", 400);
    if (response.status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
}
