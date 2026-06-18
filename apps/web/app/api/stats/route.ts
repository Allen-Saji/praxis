import { NextResponse } from "next/server";
import { getIndexStats } from "@/lib/praxis.server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** AgentIndex counters that drive the live drains-prevented number. */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, { bucket: "stats" });
  if (limited) return limited;

  try {
    const stats = await getIndexStats();
    return NextResponse.json({ stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read index stats.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
