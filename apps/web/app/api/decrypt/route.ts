import { NextResponse } from "next/server";
import { revealReasoning } from "@/lib/praxis.server";

export const dynamic = "force-dynamic";

/**
 * Decrypt a sealed reasoning blob. The client sends { blobId, viewer }; the
 * server runs PraxisReader.reveal so the seal master secret never reaches the
 * browser. Returns 403 if the viewer is not on the auditor allowlist.
 */
export async function POST(request: Request) {
  let body: { blobId?: string; viewer?: string };
  try {
    body = (await request.json()) as { blobId?: string; viewer?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { blobId, viewer } = body;
  if (!blobId || !viewer) {
    return NextResponse.json(
      { ok: false, error: "blobId and viewer are required" },
      { status: 400 },
    );
  }

  const result = await revealReasoning(blobId, viewer);
  if (result.ok) {
    return NextResponse.json(result);
  }
  return NextResponse.json(result, { status: result.status });
}
