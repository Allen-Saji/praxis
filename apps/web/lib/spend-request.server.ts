import "server-only";
import { z } from "zod";
import { normalizeSuiAddress, parseMist } from "@allen-saji/praxis-control-plane";
import { HttpError, readJsonBody } from "./control-plane.server";

const metadataSchema = z.record(z.string(), z.unknown()).optional();
const reasoningSchema = z.object({ prompt: z.string().min(1).max(4_000), decision: z.string().min(1).max(2_000), model: z.string().min(1).max(128).regex(/^[\x20-\x7e]+$/), metadata: metadataSchema }).strict();
const bodySchema = z.object({ recipient: z.string().min(1), amountMist: z.string(), coinType: z.literal("0x2::sui::SUI"), reasoning: reasoningSchema, privacy: z.enum(["public", "sealed"]) }).strict();

export async function readSpendRequest(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try { body = await readJsonBody(request, (value) => bodySchema.parse(value)); }
  catch (error) {
    if (error instanceof z.ZodError) throw new HttpError(400, "INVALID_SPEND_REQUEST", "Provide a recipient, exact MIST amount, SUI coin type and public reasoning. Extra fields are not accepted.");
    throw error;
  }
  if (body.privacy === "sealed") throw new HttpError(422, "SEALED_REASONING_NOT_AVAILABLE", "Sealed reasoning is unavailable in the hosted Testnet preview");
  validateMetadata(body.reasoning.metadata);
  try {
    return { ...body, recipient: normalizeSuiAddress(body.recipient), amountMist: parseMist(body.amountMist).toString(), privacy: "public" as const };
  } catch {
    throw new HttpError(400, "INVALID_SPEND_REQUEST", "Recipient or amount is invalid. Use a Sui address and a positive integer MIST amount.");
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
