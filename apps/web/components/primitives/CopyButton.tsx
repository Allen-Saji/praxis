"use client";

import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

/** Click-to-copy with a brief confirmation. Color is not the only signal: the
 *  icon swaps from copy to check. */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be blocked in some contexts; fail silently.
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : label}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-[var(--text-low)] transition-colors duration-150 hover:bg-[var(--panel-2)] hover:text-[var(--text-mid)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-[var(--risk-low)]" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
