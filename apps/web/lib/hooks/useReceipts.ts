"use client";

import useSWR from "swr";
import { jsonFetcher } from "./fetcher";
import type { SerializedReceipt } from "../serialized";

interface ReceiptsResponse {
  receipts: SerializedReceipt[];
}

/**
 * Live spend stream feed via SWR. Polls /api/receipts on a 5s interval when
 * `live` is true; pausing stops the poll without dropping the current data.
 */
export function useReceipts(opts: {
  initial: SerializedReceipt[];
  live: boolean;
  limit?: number;
}) {
  const { initial, live, limit = 50 } = opts;
  const { data, error, isLoading, mutate } = useSWR<ReceiptsResponse>(
    `/api/receipts?limit=${limit}`,
    jsonFetcher,
    {
      fallbackData: { receipts: initial },
      refreshInterval: live ? 5_000 : 0,
      revalidateOnFocus: live,
      keepPreviousData: true,
      dedupingInterval: 2_000,
    },
  );

  return {
    receipts: data?.receipts ?? initial,
    error: error as Error | undefined,
    isLoading,
    refresh: mutate,
  };
}
