"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { truncateMiddle } from "@/lib/format";
import { suiscanUrl, type ExplorerKind } from "@/lib/explorer";
import { CopyButton } from "@/components/primitives/CopyButton";

/**
 * A truncated, mono address/digest with click-to-copy and an explorer link in
 * the route for its kind. Never truncate without copy + explorer (DESIGN.md
 * anti-patterns).
 */
export function Address({
  value,
  kind = "account",
  copy = true,
  link = true,
  head,
  tail,
  className,
}: {
  value: string;
  kind?: ExplorerKind;
  copy?: boolean;
  link?: boolean;
  head?: number;
  tail?: number;
  className?: string;
}) {
  const display = truncateMiddle(value, head ?? 6, tail ?? 4);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="font-mono text-[14px] leading-[20px] text-[var(--text-hi)]" title={value}>
        {display}
      </span>
      {copy ? <CopyButton value={value} label="Copy address" /> : null}
      {link ? (
        <Link
          href={suiscanUrl(kind, value)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${kind} on Suiscan`}
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-[4px] text-[var(--text-low)] transition-colors duration-150 hover:bg-[var(--panel-2)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </span>
  );
}
