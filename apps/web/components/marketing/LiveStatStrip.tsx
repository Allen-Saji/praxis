"use client";

import { CountUp } from "@/components/vendor/CountUp";
import { useIndexStats } from "@/lib/hooks/useIndexStats";
import { formatPercent, withThousands } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { SerializedIndexStats } from "@/lib/serialized";

/**
 * Compact live proof strip for the landing page. One inline row of the three
 * AgentIndex counters (blocked decisions, signed spends, intervention rate), live from chain.
 * Replaces the oversized single-number counter block: keeps the "this is real
 * and working on testnet" proof without spotlighting a small number.
 */
export function LiveStatStrip({ initial }: { initial: SerializedIndexStats }) {
  const { stats } = useIndexStats({ initial, live: true });

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-low)]">
        <span
          className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--risk-low)]"
          aria-hidden="true"
        />
        live on Sui testnet
      </span>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 sm:gap-x-7">
        <Stat value={<CountUp value={stats.totalAborts} />} label="blocked decisions" accent />
        <Divider />
        <Stat value={withThousands(String(stats.totalCount))} label="signed spends" />
        <Divider />
        <Stat value={formatPercent(stats.abortRate)} label="intervention rate" />
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  accent = false,
}: {
  value: React.ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span
        className={cn(
          "tabular font-mono text-[26px] leading-none font-semibold",
          accent
            ? "text-[var(--accent)] [text-shadow:0_0_18px_rgba(0,210,255,0.45)]"
            : "text-[var(--text-hi)]",
        )}
      >
        {value}
      </span>
      <span className="text-[13px] text-[var(--text-mid)]">{label}</span>
    </span>
  );
}

function Divider() {
  return <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden="true" />;
}
