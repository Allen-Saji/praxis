import { NextResponse } from "next/server";
import { getReasoning } from "@/lib/praxis.server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Fetch a reasoning blob (sealed marker or public plaintext). Walrus blobs are
 *  immutable, so the response is cacheable by blobId. */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, { bucket: "reasoning" });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const blobId = searchParams.get("blobId");
  if (!blobId) {
    return NextResponse.json({ error: "blobId is required" }, { status: 400 });
  }
  const result = await getReasoning(blobId);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
