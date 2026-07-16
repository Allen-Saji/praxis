import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Amount } from "@/components/data/Amount";
import { RiskBadge } from "@/components/data/RiskBadge";
import { Timestamp } from "@/components/data/Timestamp";
import { DecisionProofRail } from "@/components/blocks/DecisionProofRail";
import { detailId } from "@/lib/stream";
import { reasonPlain, scoreToBand } from "@/lib/risk";
import { truncateMiddle } from "@/lib/format";
import type { SerializedStreamEntry } from "@/lib/serialized";

/** A live testnet intervention used as proof, not as a decorative product demo. */
export function LandingIntervention({ entry }: { entry: SerializedStreamEntry }) {
  const blocked = entry.status === "aborted";
  const finding = entry.abortReason?.toUpperCase() ?? (blocked ? "BLOCKED" : "APPROVED");

  return (
    <section
      className="bg-[rgba(5,7,10,0.94)]"
      aria-labelledby="landing-intervention-title"
    >
      <div className="mx-auto w-full max-w-[1080px] px-5 py-20 md:py-28">
        <div className="grid gap-8 md:grid-cols-[0.72fr_1.28fr] md:items-end">
          <div>
            <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--risk-low)]" aria-hidden="true" />
              Live testnet evidence
            </span>
            <h2
              id="landing-intervention-title"
              className="mt-4 max-w-[12ch] font-display text-[clamp(32px,4.5vw,54px)] font-semibold leading-[1.03] tracking-[-0.035em] text-[var(--text-hi)]"
            >
              {blocked ? "This spend never reached the wallet." : "This spend cleared the gate."}
            </h2>
          </div>
          <p className="max-w-[56ch] text-[17px] leading-7 text-[var(--text-mid)] md:justify-self-end">
            This is a real Praxis decision from Sui testnet. The intent, simulation, gate result, and durable audit evidence stay connected as one inspectable record.
          </p>
        </div>

        <div className="mt-10 overflow-hidden border-y border-white/10 bg-[rgba(15,18,23,0.72)]">
          <div className="grid gap-8 px-5 py-7 md:grid-cols-[minmax(0,1fr)_auto] md:px-7">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--risk-critical)]">
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  {blocked ? "Intervention" : "Approved decision"}
                </span>
                <span className="text-[var(--text-low)]">/</span>
                <Timestamp ms={entry.timestampMs} className="text-[12px]" />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Amount mist={entry.amount} className="text-[28px] leading-none" />
                <span className="h-8 w-px bg-white/10" aria-hidden="true" />
                <span className="font-mono text-[13px] text-[var(--text-mid)]" title={entry.agent}>
                  agent {truncateMiddle(entry.agent, 8, 6)}
                </span>
                <RiskBadge level={scoreToBand(entry.riskScore)} />
                <span className="finding-code">{finding}</span>
              </div>

              <p className="mt-5 max-w-[66ch] text-[16px] leading-7 text-[var(--text-mid)]">
                {blocked
                  ? reasonPlain(entry.abortReason ?? "")
                  : "The simulation and policy gate passed before the wallet signed."}
              </p>
            </div>

            <Link
              href={`/app/spend/${encodeURIComponent(detailId(entry))}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-[var(--r-sm)] bg-[var(--text-hi)] px-5 text-[14px] font-semibold text-[var(--bg)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Inspect the evidence
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="border-t border-white/10 bg-[rgba(6,8,11,0.72)] px-5 py-5 md:px-7">
            <DecisionProofRail entry={entry} finding={finding} />
          </div>
        </div>
      </div>
    </section>
  );
}
