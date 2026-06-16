"use client";

import useSWR from "swr";
import { jsonFetcher } from "./fetcher";
import type { SerializedReasoningResult } from "../serialized";

/**
 * Fetch a reasoning blob via the route handler. Walrus blobs are immutable, so
 * SWR caches by blobId indefinitely and never revalidates.
 */
export function useReasoning(blobId: string | null) {
  const { data, error, isLoading } = useSWR<SerializedReasoningResult>(
    blobId ? `/api/reasoning?blobId=${encodeURIComponent(blobId)}` : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
    },
  );
  return { reasoning: data, error: error as Error | undefined, isLoading };
}
