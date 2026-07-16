"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { truncateId } from "@/lib/format";
import { walrusBlobUrl } from "@/lib/explorer";
import { CopyButton } from "@/components/primitives/CopyButton";

/**
 * A Walrus blob id, mono truncated. Links to the aggregator blob URL, or shows a
 * "local fallback" tag for `local:`-prefixed dev ids that have no public URL.
 */
export function BlobLink({ blobId, className }: { blobId: string; className?: string }) {
  const isLocal = blobId.startsWith("local:");
  const display = truncateId(isLocal ? blobId.slice("local:".length) : blobId, 8, 4);

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span
        className="font-mono text-[14px] leading-[20px] text-[var(--text-hi)]"
        title={blobId}
      >
        {display}
      </span>
      {isLocal ? (
        <span className="rounded-[4px] border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-low)]">
          local fallback
        </span>
      ) : (
        <>
          <CopyButton value={blobId} label="Copy blob id" />
          <Link
            href={walrusBlobUrl(blobId)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open blob on Walrus"
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-[4px] text-[var(--text-low)] transition-colors duration-150 hover:bg-[var(--panel-2)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </>
      )}
    </span>
  );
}
