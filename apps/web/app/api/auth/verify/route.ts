import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { challengeMessage, createSessionToken, tokenDigest } from "@allen-saji/praxis-control-plane";
import { authGraphqlClient, authRepository, configuredOrigin, readJsonBody, requestSessionToken, requireSameOrigin, requiredSecret, safeErrorResponse, sessionCookieName, sessionCookieOptions, sha256 } from "@/lib/control-plane.server";
export const dynamic = "force-dynamic";
const schema = z.object({ address: z.string().min(1), nonce: z.string().min(1), signature: z.string().min(1) }).strict();
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readJsonBody(request, (value) => schema.parse(value));
    const address = normalizeSuiAddress(body.address);
    const repo = authRepository();
    const nonceHash = sha256(body.nonce);
    const challenge = await repo.findChallenge(nonceHash, address);
    const now = new Date();
    const origin = configuredOrigin(request);
    if (!challenge || challenge.usedAt || challenge.network !== "testnet" || challenge.domain !== new URL(origin).host || challenge.expiresAt <= now || challenge.issuedAt > new Date(now.getTime() + 60_000)) {
      throw new Error("challenge unavailable");
    }
    const message = challengeMessage({ domain: challenge.domain, uri: origin, address, nonce: body.nonce, issuedAt: challenge.issuedAt, expiresAt: challenge.expiresAt });
    await verifyPersonalMessageSignature(new TextEncoder().encode(message), body.signature, { address, client: authGraphqlClient() });
    const sessionToken = createSessionToken();
    const priorToken = requestSessionToken(request);
    const result = await repo.completeLogin({
      address,
      nonceHash,
      sessionTokenHash: tokenDigest(sessionToken, requiredPepper()),
      priorSessionHash: priorToken ? tokenDigest(priorToken, requiredPepper()) : null,
    });
    const response = NextResponse.json({ user: { id: result.user.id, address: result.user.primarySuiAddress } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(sessionCookieName(), sessionToken, sessionCookieOptions());
    return response;
  } catch (error) {
    try { await authRepository().recordAuthFailure("signature_invalid"); } catch { /* audit failure must not expose internals */ }
    return safeErrorResponse(error, "AUTHENTICATION_FAILED", 401);
  }
}
function requiredPepper(): string { return requiredSecret("PRAXIS_SESSION_PEPPER"); }
