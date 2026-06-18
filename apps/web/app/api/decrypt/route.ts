import { NextResponse } from "next/server";
import { revealReasoning } from "@/lib/praxis.server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Decrypt a sealed reasoning blob. The client sends { blobId, viewer, message,
 * signature } where the viewer has signed the canonical decrypt challenge; the
 * server proves control of the viewer address, then runs PraxisReader.reveal so
 * the seal master secret never reaches the browser. Returns 401 if the
 * signature does not prove control of the viewer, 403 if the viewer is not on
 * the auditor allowlist.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, { bucket: "decrypt", limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  let body: { blobId?: string; viewer?: string; message?: string; signature?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { blobId, viewer, message, signature } = body;
  if (!blobId || !viewer || !message || !signature) {
    return NextResponse.json(
      { ok: false, error: "blobId, viewer, message and signature are required" },
      { status: 400 },
    );
  }

  const result = await revealReasoning(blobId, viewer, message, signature);
  if (result.ok) {
    return NextResponse.json(result);
  }
  return NextResponse.json(result, { status: result.status });
}
