import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { resolveRpcUrl } from "./config";
import type { Network } from "./types";

/**
 * Resilient Sui JSON-RPC client. Mysten retired public JSON-RPC on
 * fullnode.<net>.sui.io, so reads run against a public provider that still
 * serves full event history but rate-limits bursts. A single dashboard load
 * fires several reads at once, which would 429. To keep the view reliable this
 * client uses a custom fetch that (1) caps in-flight requests and (2) retries
 * 429/5xx with exponential backoff + jitter, honoring Retry-After.
 */

const MAX_CONCURRENT = 2;
const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 8000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** FIFO gate that never lets more than `limit` requests run at once. */
function createGate(limit: number): () => Promise<() => void> {
  let active = 0;
  const waiting: Array<() => void> = [];
  const pump = () => {
    if (active >= limit) return;
    const run = waiting.shift();
    if (run) {
      active += 1;
      run();
    }
  };
  return () =>
    new Promise<() => void>((resolve) => {
      waiting.push(() =>
        resolve(() => {
          active -= 1;
          pump();
        }),
      );
      pump();
    });
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, MAX_BACKOFF_MS);
  }
  const base = 400 * 2 ** attempt; // 400, 800, 1600, 3200, 6400
  return Math.min(base + base * 0.25 * Math.random(), MAX_BACKOFF_MS);
}

/** A fetch that gates concurrency and retries transient RPC failures. */
export function resilientFetch(limit = MAX_CONCURRENT): typeof fetch {
  const acquire = createGate(limit);
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const release = await acquire();
    try {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
          const res = await fetch(input, init);
          if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
            await sleep(backoffMs(attempt, res.headers.get("retry-after")));
            continue;
          }
          return res;
        } catch (err) {
          lastErr = err;
          if (attempt >= MAX_RETRIES) throw err;
          await sleep(backoffMs(attempt, null));
        }
      }
      throw lastErr;
    } finally {
      release();
    }
  };
  return wrapped as typeof fetch;
}

/** Build the default resilient client for a network (with optional url override). */
export function makeSuiClient(network: Network, rpcUrl?: string): SuiJsonRpcClient {
  const transport = new JsonRpcHTTPTransport({
    url: resolveRpcUrl(network, rpcUrl),
    fetch: resilientFetch(),
  });
  return new SuiJsonRpcClient({ transport, network });
}
