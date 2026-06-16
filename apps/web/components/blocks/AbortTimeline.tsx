import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Timestamp } from "@/components/data/Timestamp";
import { BlobLink } from "@/components/data/BlobLink";
import { RiskBadge } from "@/components/data/RiskBadge";
import { EmptyState } from "./EmptyState";
import { scoreToBand } from "@/lib/risk";
import type { SerializedAbort } from "@/lib/serialized";

/**
 * Vertical abort timeline, based on ScrollX UI Timeline and restyled to our
 * tokens. Each node is one AbortRecorded event: time, reason, score, blob.
 * Frames blocked spends as protection, not failure (DESIGN.md section 5).
 */
export function AbortTimeline({ aborts }: { aborts: SerializedAbort[] }) {
  if (aborts.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        headline="This agent has not been blocked yet."
        body="Every spend so far passed the gate."
      />
    );
  }

  return (
    <ol className="relative flex flex-col gap-0 border-l border-[var(--border)] pl-6">
      {aborts.map((abort, i) => (
        <li key={`${abort.blobId}-${i}`} className="relative pb-6 last:pb-0">
          <span
            className="absolute -left-[calc(1.5rem+1px)] top-1 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-[var(--bg)]"
            style={{ backgroundColor: "var(--risk-critical)" }}
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Timestamp ms={abort.timestampMs} className="w-20" />
            <span className="font-mono text-[13px] text-[var(--risk-critical)]">
              {abort.reasonLabel}
            </span>
            <RiskBadge level={scoreToBand(abort.riskScore)} showLabel={false} />
            <span className="tabular font-mono text-[13px] text-[var(--text-mid)]">
              score {abort.riskScore}
            </span>
            <span className="text-[12px] text-[var(--text-low)]">blob</span>
            <BlobLink blobId={abort.blobId} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A link to view a spend by receipt id (used in timeline rows where available). */
export function SpendViewLink({ id }: { id: string }) {
  return (
    <Link
      href={`/app/spend/${id}`}
      className="text-[13px] text-[var(--accent)] transition-colors duration-150 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      view
    </Link>
  );
}
