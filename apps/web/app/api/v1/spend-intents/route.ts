import { z } from "zod";
import { authorizeAgentRequest } from "@/lib/agent-auth.server";
import { HttpError, readJsonBody, safeErrorResponse } from "@/lib/control-plane.server";
import { createAndProcessSpend, safeIntent } from "@/lib/spend.server";

const metadataSchema = z.record(z.string(), z.unknown()).optional();
const reasoningSchema = z.object({ prompt: z.string().min(1).max(4_000), decision: z.string().min(1).max(2_000), model: z.string().min(1).max(128).regex(/^[\x20-\x7e]+$/), metadata: metadataSchema }).strict();
const bodySchema = z.object({ recipient: z.string().min(1), amountMist: z.string(), coinType: z.literal("0x2::sui::SUI"), reasoning: reasoningSchema, privacy: z.enum(["public", "sealed"]) }).strict();

export async function POST(request: Request) {
  try {
    const context = await authorizeAgentRequest(request);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !/^[\x20-\x7e]+$/.test(idempotencyKey)) throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8 to 128 printable ASCII characters");
    const body = await readJsonBody(request, (value) => bodySchema.parse(value));
    if (body.privacy === "sealed") throw new HttpError(422, "SEALED_REASONING_NOT_AVAILABLE", "Sealed reasoning is unavailable in the hosted Testnet preview");
    validateMetadata(body.reasoning.metadata);
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

function validateMetadata(metadata: Record<string, unknown> | undefined): void {
  if (!metadata) return;
  let keys = 0;
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 5) throw new HttpError(400, "INVALID_REASONING", "Reasoning metadata is too deep");
    if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return;
    if (!value || typeof value !== "object" || seen.has(value)) throw new HttpError(400, "INVALID_REASONING", "Reasoning metadata is invalid");
    seen.add(value);
    try {
      for (const [key, nested] of Object.entries(value)) {
        keys += 1;
        if (keys > 50 || ["__proto__", "prototype", "constructor"].includes(key)) throw new HttpError(400, "INVALID_REASONING", "Reasoning metadata contains unsupported keys");
        visit(nested, depth + 1);
      }
    } finally { seen.delete(value); }
  };
  visit(metadata, 1);
  if (new TextEncoder().encode(JSON.stringify(metadata)).byteLength > 8 * 1024) throw new HttpError(400, "INVALID_REASONING", "Reasoning metadata is too large");
}
