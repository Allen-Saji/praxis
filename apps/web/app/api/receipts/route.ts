import { NextResponse } from "next/server";
import { getRecentReceipts } from "@/lib/praxis.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Live spend stream feed. Polled by SWR on a 5s interval (DESIGN.md Q2). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
  try {
    const receipts = await getRecentReceipts(limit);
    return NextResponse.json({ receipts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read receipts.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
