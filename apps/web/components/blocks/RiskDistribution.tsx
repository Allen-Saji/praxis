import { cn } from "@/lib/cn";
import { RISK_ORDER, RISK_LABEL, type RiskBand } from "@/lib/risk";
import { RISK_META } from "@/components/data/RiskBadge";

/**
 * Compact stacked horizontal bar of low/medium/high/critical counts, with a
 * legend. The only chart in v1 (DESIGN.md section 8). Color carries meaning
 * here, paired with a labeled legend so it is never color-only.
 */
export function RiskDistribution({
  counts,
  showLegend = true,
  className,
}: {
  counts: Record<RiskBand, number>;
  showLegend?: boolean;
  className?: string;
}) {
  const total = RISK_ORDER.reduce((sum, band) => sum + counts[band], 0);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-[var(--panel-2)]"
        role="img"
        aria-label={`Risk distribution: ${RISK_ORDER.map(
          (b) => `${RISK_LABEL[b]} ${counts[b]}`,
        ).join(", ")}`}
      >
        {total === 0 ? (
          <span className="flex-1" />
        ) : (
          RISK_ORDER.map((band) =>
            counts[band] > 0 ? (
              <span
                key={band}
                style={{
                  width: `${(counts[band] / total) * 100}%`,
                  backgroundColor: RISK_META[band].color,
                }}
              />
            ) : null,
          )
        )}
      </div>
      {showLegend ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {RISK_ORDER.map((band) => (
            <span key={band} className="inline-flex items-center gap-1.5 text-[12px]">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: RISK_META[band].color }}
                aria-hidden="true"
              />
              <span className="text-[var(--text-mid)]">{RISK_LABEL[band]}</span>
              <span className="tabular font-mono text-[var(--text-hi)]">{counts[band]}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
