"use client";

import { useIndexStats } from "@/lib/hooks/useIndexStats";
import { formatPercent, withThousands } from "@/lib/format";
import type { SerializedIndexStats } from "@/lib/serialized";

/** A single accounting line for decisions, replacing four competing stat cards. */
export function DecisionSummaryBar({ initial }: { initial: SerializedIndexStats }) {
  const { stats } = useIndexStats({ initial, live: true });
  const decisions = stats.totalCount + stats.totalAborts;

  const items = [
    { label: "decisions", value: decisions },
    { label: "signed", value: stats.totalCount },
    { label: "blocked", value: stats.totalAborts, accent: true },
    { label: "intervention rate", value: formatPercent(stats.abortRate) },
  ];

  return (
    <dl className="evidence-surface grid grid-cols-2 divide-x divide-y divide-[var(--divider)] overflow-hidden rounded-[var(--r-md)] sm:grid-cols-4 sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="flex min-h-20 flex-col justify-center px-4 py-3">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-mid)]">
            {item.label}
          </dt>
          <dd
            className="mt-1 font-mono text-[24px] leading-none tabular-nums"
            style={{ color: item.accent ? "var(--risk-critical)" : "var(--text-hi)" }}
          >
            {typeof item.value === "number"
              ? withThousands(String(item.value))
              : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
