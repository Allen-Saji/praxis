import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError, safeErrorResponse } from "@/lib/control-plane.server";
import { reconcileIntents } from "@/lib/spend.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const expected = process.env.PRAXIS_INTERNAL_TOKEN;
    const supplied = request.headers.get("authorization");
    if (!expected || !supplied?.startsWith("Bearer ") || !safeEqual(supplied.slice(7), expected)) throw new HttpError(401, "INTERNAL_UNAUTHENTICATED", "Internal authorization failed");
    return Response.json({ reconciled: await reconcileIntents() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeErrorResponse(error, "RECONCILIATION_FAILED", 503); }
}

function safeEqual(left: string, right: string) {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}
