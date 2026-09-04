import { NextResponse } from "next/server";
import { tokenDigest } from "@allen-saji/praxis-control-plane";
import { authRepository, requestSessionToken, requireSameOrigin, requiredSecret, safeErrorResponse, sessionCookieName, sessionCookieOptions } from "@/lib/control-plane.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const token = requestSessionToken(request);
    if (token) await authRepository().revokeSession(tokenDigest(token, requiredSecret("PRAXIS_SESSION_PEPPER")), new Date());
    const response = NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(sessionCookieName(), "", sessionCookieOptions(0));
    return response;
  } catch (error) {
    return safeErrorResponse(error, "LOGOUT_FAILED", 503);
  }
}
