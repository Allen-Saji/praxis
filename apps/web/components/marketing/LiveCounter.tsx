"use client";

import { CountUp } from "@/components/vendor/CountUp";
import { useIndexStats } from "@/lib/hooks/useIndexStats";
import type { SerializedIndexStats } from "@/lib/serialized";

/**
 * The live drains-prevented number on the landing page. Count-up on mount, then
 * ticks as new aborts land (SWR poll). The number does the work; the label is
 * lowercase (DESIGN.md section 12).
 */
export function LiveCounter({ initial }: { initial: SerializedIndexStats }) {
  const { stats } = useIndexStats({ initial, live: true });

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1">
        <CountUp
          value={stats.totalAborts}
          className="tabular font-mono text-[clamp(56px,9vw,84px)] leading-none font-semibold text-[var(--accent)] [text-shadow:0_0_32px_rgba(0,210,255,0.55)]"
        />
        <span className="text-[clamp(18px,2.4vw,22px)] font-medium text-[var(--text-hi)]">
          drains prevented on testnet
        </span>
      </div>
      <span className="font-mono text-[12px] text-[var(--text-low)]">
        live from AgentIndex.total_aborts
      </span>
    </div>
  );
}
