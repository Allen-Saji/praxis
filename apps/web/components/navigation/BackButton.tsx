"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  canUseBrowserBack,
  INTERNAL_NAVIGATION_KEY,
} from "@/lib/navigation-history";

export function BackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  function returnToPreviousPage() {
    const internalNavigation = window.sessionStorage.getItem(
      INTERNAL_NAVIGATION_KEY,
    );

    if (canUseBrowserBack(internalNavigation, window.history.length)) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={returnToPreviousPage}
      aria-label="Return to previous page"
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[var(--r-sm)] px-3 text-[13px] font-medium text-[var(--text-mid)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text-hi)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
    >
      <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.8} />
      Back
    </button>
  );
}
