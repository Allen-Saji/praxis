"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import { Amount } from "@/components/data/Amount";
import { RiskBadge } from "@/components/data/RiskBadge";
import { Timestamp } from "@/components/data/Timestamp";
import { DecisionProofRail } from "./DecisionProofRail";
import { useReasoning } from "@/lib/hooks/useReasoning";
import { detailId } from "@/lib/stream";
import { reasonPlain, scoreToBand } from "@/lib/risk";
import { truncateMiddle } from "@/lib/format";
import { walrusBlobUrl } from "@/lib/explorer";
import type { SerializedStreamEntry } from "@/lib/serialized";

/**
 * The dashboard's primary story. Immediate event facts render without waiting
 * for Walrus; public reasoning enriches the finding when it arrives.
 */
export function LatestIntervention({ entry }: { entry: SerializedStreamEntry }) {
  const { reasoning, isLoading } = useReasoning(entry.blobId);
  const blob = reasoning && !reasoning.sealed ? reasoning.reasoning : null;
  const finding =
    blob?.simulation.risks[0]?.code ??
    entry.abortReason?.toUpperCase() ??
    (entry.status === "aborted" ? "BLOCKED" : "APPROVED");
  const blocked = entry.status === "aborted";

  return (
    <section className="incident-surface overflow-hidden rounded-[var(--r-lg)]" aria-labelledby="latest-intervention-title">
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--risk-critical)]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Latest intervention
            </span>
            <span className="text-[12px] text-[var(--text-low)]">/</span>
            <Timestamp ms={entry.timestampMs} className="text-[12px] text-[var(--text-mid)]" />
          </div>

          <h2
            id="latest-intervention-title"
            className="mt-3 max-w-[20ch] font-display text-[clamp(28px,4vw,44px)] font-semibold leading-[1.02] tracking-[-0.035em] text-[var(--text-hi)]"
          >
            {blocked ? "Blocked before signing." : "Signed after review."}
          </h2>

          <p className="mt-3 max-w-[64ch] text-[15px] leading-6 text-[var(--text-mid)]">
            {blocked
              ? `Praxis stopped this agent decision. ${reasonPlain(entry.abortReason ?? "")}`
              : "Praxis simulated the transaction, cleared the gate, and recorded the evidence."}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="font-mono text-[clamp(24px,3vw,36px)] leading-none text-[var(--text-hi)]">
              <Amount mist={entry.amount} className="text-[inherit] leading-none" />
            </span>
            <span className="h-8 w-px bg-[var(--divider)]" aria-hidden="true" />
            <span className="font-mono text-[13px] text-[var(--text-mid)]" title={entry.agent}>
              agent {truncateMiddle(entry.agent, 8, 6)}
            </span>
            <RiskBadge level={scoreToBand(entry.riskScore)} />
            <span className="finding-code" aria-busy={isLoading}>
              {finding}
            </span>
          </div>
        </div>

        <div className="flex items-end gap-2 lg:flex-col lg:items-stretch lg:justify-end">
          <Link
            href={`/app/spend/${encodeURIComponent(detailId(entry))}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--r-sm)] bg-[var(--text-hi)] px-4 text-[14px] font-semibold text-[var(--bg)] transition-colors duration-150 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] lg:flex-none"
          >
            Inspect evidence
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href={walrusBlobUrl(entry.blobId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--r-sm)] border border-[var(--divider)] px-4 text-[14px] text-[var(--text-mid)] transition-colors duration-150 hover:border-[var(--border-hi)] hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Walrus
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="border-t border-[var(--divider)] bg-[rgba(8,10,13,0.58)] px-5 py-4 lg:px-6">
        <DecisionProofRail entry={entry} finding={finding} />
      </div>
    </section>
  );
}
