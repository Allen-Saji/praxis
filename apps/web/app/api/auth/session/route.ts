import { safeErrorResponse, sessionForRequest } from "@/lib/control-plane.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await sessionForRequest(request);
    if (!session) return Response.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
    return Response.json({ authenticated: true, user: { id: session.user.id, address: session.user.primarySuiAddress }, expiresAt: session.session.expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error, "SESSION_LOOKUP_FAILED", 503);
  }
}
