"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function RefreshActivity() {
  const router = useRouter(); const [pending, start] = useTransition();
  return <button type="button" disabled={pending} aria-busy={pending} onClick={() => start(() => router.refresh())} className="focus-ring inline-flex min-h-11 items-center rounded border border-[var(--border)] px-3 text-sm text-[var(--text-mid)] disabled:opacity-50">{pending ? "Refreshing..." : "Refresh"}</button>;
}
