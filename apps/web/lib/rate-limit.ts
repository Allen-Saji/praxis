import { NextResponse } from "next/server";

/**
 * Minimal in-memory fixed-window rate limiter for the public API routes. Keyed
 * by client IP. This is a best-effort baseline to stop trivial DoS / Walrus
 * egress amplification; note that on serverless (Vercel) the map is per-instance,
 * so a shared store (Upstash/Redis) is the production upgrade.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientKey(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Returns a 429 response when the caller is over budget, or null to proceed.
 * Defaults: 60 requests per 60s window.
 */
export function enforceRateLimit(
  request: Request,
  opts: { limit?: number; windowMs?: number; bucket?: string } = {},
): NextResponse | null {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();
  const key = `${opts.bucket ?? "default"}:${clientKey(request)}`;

  // Opportunistic sweep so the map cannot grow without bound.
  if (buckets.size > 5_000) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  }

  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;

  if (b.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  return null;
}
