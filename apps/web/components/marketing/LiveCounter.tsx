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
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-baseline gap-3">
        <CountUp
          value={stats.totalAborts}
          className="tabular font-mono text-[44px] leading-none font-medium text-[var(--text-hi)]"
        />
        <span className="border-b-2 border-[var(--accent)] pb-1 text-[18px] text-[var(--text-mid)]">
          drains prevented on testnet
        </span>
      </div>
      <span className="text-[12px] text-[var(--text-low)]">
        live from AgentIndex.total_aborts
      </span>
    </div>
  );
}
