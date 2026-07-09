import "server-only";

type Entry = { promise: Promise<unknown>; expires: number };

const store = new Map<string, Entry>();

/**
 * Single-flight + TTL cache for server reads. Concurrent callers with the same
 * key share one in-flight promise, so a burst of dashboard loads and 5s SWR
 * polls from many viewers collapses to a single RPC round-trip instead of one
 * per request. The resolved value is then reused for `ttlMs`. Rejections are
 * never cached: a failed read drops its entry so the next call retries live.
 *
 * The Praxis testnet dataset is effectively static (no seeder runs in prod), so
 * a short TTL keeps the "live" feel while making an unkeyed public RPC endpoint
 * safe under demo traffic.
 */
export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.promise as Promise<T>;

  const promise = fn().catch((err) => {
    if (store.get(key)?.promise === promise) store.delete(key);
    throw err;
  });
  store.set(key, { promise, expires: now + ttlMs });
  return promise;
}
