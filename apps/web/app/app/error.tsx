"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/primitives/Button";

/** App-section error boundary. Surfaces RPC/read failures without a blank screen. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--panel-2)] text-[var(--risk-high)]">
        <TriangleAlert className="h-5 w-5" />
      </span>
      <h1 className="text-[20px] font-semibold text-[var(--text-hi)]">Could not load this view</h1>
      <p className="text-[14px] leading-[20px] text-[var(--text-mid)]">
        This page is temporarily unavailable. Please try again.
      </p>
      <Button variant="secondary" size="sm" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}
