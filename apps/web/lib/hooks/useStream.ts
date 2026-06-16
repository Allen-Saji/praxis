"use client";

import useSWR from "swr";
import { jsonFetcher } from "./fetcher";
import type { SerializedStreamEntry } from "../serialized";

interface StreamResponse {
  entries: SerializedStreamEntry[];
}

/**
 * Unified spend stream via SWR. Polls /api/stream on a 5s interval when `live`
 * is true; pausing stops the poll without dropping the current data. Returns
 * confirmed and aborted spends interleaved by time.
 */
export function useStream(opts: {
  initial: SerializedStreamEntry[];
  live: boolean;
  limit?: number;
}) {
  const { initial, live, limit = 50 } = opts;
  const { data, error, isLoading, mutate } = useSWR<StreamResponse>(
    `/api/stream?limit=${limit}`,
    jsonFetcher,
    {
      fallbackData: { entries: initial },
      refreshInterval: live ? 5_000 : 0,
      revalidateOnFocus: live,
      keepPreviousData: true,
      dedupingInterval: 2_000,
    },
  );

  return {
    entries: data?.entries ?? initial,
    error: error as Error | undefined,
    isLoading,
    refresh: mutate,
  };
}
