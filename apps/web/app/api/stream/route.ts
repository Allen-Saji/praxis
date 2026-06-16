import { NextResponse } from "next/server";
import { getStream } from "@/lib/praxis.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Unified spend stream: confirmed and aborted spends interleaved by time, newest
 * first. Polled by SWR on a 5s interval (DESIGN.md Q2). Backed by
 * PraxisReader.stream().
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
  try {
    const entries = await getStream(limit);
    return NextResponse.json({ entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read the spend stream.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
