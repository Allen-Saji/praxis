import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { challengeMessage } from "@allen-saji/praxis-control-plane";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { authRepository, sha256 } from "@/lib/control-plane.server";
export const dynamic = "force-dynamic";
const schema = z.object({ address: z.string().min(1), network: z.literal("testnet") }).strict();
export async function POST(request: Request) { try { const body = schema.parse(await request.json()); const address = normalizeSuiAddress(body.address); const issuedAt = new Date(); const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000); const nonce = randomBytes(32).toString("base64url"); const domain = new URL(process.env.APP_ORIGIN ?? request.url).host; const uri = process.env.APP_ORIGIN ?? new URL(request.url).origin; await authRepository().createChallenge({ address, nonceHash: sha256(nonce), domain, issuedAt, expiresAt }); return NextResponse.json({ nonce, message: challengeMessage({ domain, uri, address, nonce, issuedAt, expiresAt }), expiresAt: expiresAt.toISOString() }); } catch { return NextResponse.json({ error: { code: "INVALID_CHALLENGE_REQUEST", message: "Invalid login challenge request" } }, { status: 400 }); } }
