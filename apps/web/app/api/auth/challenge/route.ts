import { randomBytes } from "node:crypto";
import { z } from "zod";
import { challengeMessage } from "@allen-saji/praxis-control-plane";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { authRepository, configuredOrigin, readJsonBody, requireSameOrigin, safeErrorResponse, sha256 } from "@/lib/control-plane.server";
export const dynamic = "force-dynamic";
const schema = z.object({ address: z.string().min(1), network: z.literal("testnet") }).strict();
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readJsonBody(request, (value) => schema.parse(value));
    const address = normalizeSuiAddress(body.address);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
    const nonce = randomBytes(32).toString("base64url");
    const uri = configuredOrigin(request);
    const domain = new URL(uri).host;
    await authRepository().createChallenge({ address, nonceHash: sha256(nonce), domain, issuedAt, expiresAt });
    return Response.json({ nonce, message: challengeMessage({ domain, uri, address, nonce, issuedAt, expiresAt }), expiresAt: expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error, "INVALID_CHALLENGE_REQUEST", 400);
  }
}
