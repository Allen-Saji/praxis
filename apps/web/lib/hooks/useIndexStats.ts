"use client";

import useSWR from "swr";
import { jsonFetcher } from "./fetcher";
import type { SerializedIndexStats } from "../serialized";

interface StatsResponse {
  stats: SerializedIndexStats;
}

/**
 * AgentIndex counters that drive the live drains-prevented number. Revalidates
 * on a short interval so the counter ticks as aborts land.
 */
export function useIndexStats(opts: { initial: SerializedIndexStats; live: boolean }) {
  const { initial, live } = opts;
  const { data, error, isLoading } = useSWR<StatsResponse>("/api/stats", jsonFetcher, {
    fallbackData: { stats: initial },
    refreshInterval: live ? 5_000 : 0,
    revalidateOnFocus: live,
    keepPreviousData: true,
    dedupingInterval: 2_000,
  });

  return {
    stats: data?.stats ?? initial,
    error: error as Error | undefined,
    isLoading,
  };
}
