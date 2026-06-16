"use client";

/** Shared JSON fetcher for SWR. Throws on non-2xx so SWR surfaces the error. */
export async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}
