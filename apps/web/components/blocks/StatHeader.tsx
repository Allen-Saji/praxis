"use client";

import { StatCard } from "./StatCard";
import { RiskDistribution } from "./RiskDistribution";
import { CountUp } from "@/components/vendor/CountUp";
import { useIndexStats } from "@/lib/hooks/useIndexStats";
import { formatPercent, withThousands } from "@/lib/format";
import type { SerializedIndexStats, SerializedAgent } from "@/lib/serialized";
import type { RiskBand } from "@/lib/risk";

/**
 * The row of stat cards above the stream. Total spends, abort rate, risk
 * distribution, and the featured drains-prevented card driven by the live
 * AgentIndex counter (CountUp). Aggregate risk mix is summed from the agent
 * summaries (DESIGN.md sections 8, 11).
 */
export function StatHeader({
  initialStats,
  agents,
}: {
  initialStats: SerializedIndexStats;
  agents: SerializedAgent[];
}) {
  const { stats } = useIndexStats({ initial: initialStats, live: true });

  const riskMix = agents.reduce<Record<RiskBand, number>>(
    (acc, a) => {
      acc.low += a.riskMix.low;
      acc.medium += a.riskMix.medium;
      acc.high += a.riskMix.high;
      acc.critical += a.riskMix.critical;
      return acc;
    },
    { low: 0, medium: 0, high: 0, critical: 0 },
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total spends" value={withThousands(String(stats.totalCount))} />
      <StatCard
        label="Abort rate"
        value={formatPercent(stats.abortRate)}
        sub="blocked of all attempted spends"
      />
      <StatCard
        label="Risk distribution"
        value={
          <div className="pt-1">
            <RiskDistribution counts={riskMix} />
          </div>
        }
      />
      <StatCard
        label="Drains prevented"
        featured
        value={<CountUp value={stats.totalAborts} />}
        sub="live from AgentIndex.total_aborts"
      />
    </div>
  );
}
