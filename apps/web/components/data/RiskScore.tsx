import { cn } from "@/lib/cn";
import { scoreToBand, RISK_LABEL } from "@/lib/risk";
import { RISK_META, riskSheen, riskGlow } from "./RiskBadge";

/**
 * A 0..100 risk score: mono number plus a 4px segmented bar colored by band.
 * Bands match the SDK thresholds (review at 30, block at 80). The bar is built
 * from 4 segments so the boundary the score crosses is visible, not just a fill.
 */
const SEGMENTS: Array<{ band: ReturnType<typeof scoreToBand>; from: number; to: number }> = [
  { band: "low", from: 0, to: 30 },
  { band: "medium", from: 30, to: 60 },
  { band: "high", from: 60, to: 80 },
  { band: "critical", from: 80, to: 100 },
];

export function RiskScore({
  score,
  variant = "compact",
  className,
}: {
  score: number;
  variant?: "compact" | "full";
  className?: string;
}) {
  const band = scoreToBand(score);
  const color = RISK_META[band].color;

  if (variant === "compact") {
    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        <span
          className="tabular font-mono text-[14px] leading-[20px]"
          style={{ color, textShadow: riskGlow(color) }}
        >
          {score}
        </span>
        <span className="flex h-1 w-12 gap-px overflow-hidden rounded-full" aria-hidden="true">
          {SEGMENTS.map((seg) => {
            const filled = score >= seg.to ? 1 : score <= seg.from ? 0 : (score - seg.from) / (seg.to - seg.from);
            return (
              <span key={seg.band} className="relative flex-1 bg-[var(--panel-2)]">
                <span
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${filled * 100}%`, background: riskSheen(RISK_META[seg.band].color) }}
                />
              </span>
            );
          })}
        </span>
      </span>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between">
        <span
          className="tabular font-mono text-[18px] leading-[24px] font-medium"
          style={{ color, textShadow: riskGlow(color) }}
        >
          {score}
          <span className="ml-1 text-[13px] text-[var(--text-low)]">/ 100</span>
        </span>
        <span className="text-[12px] font-medium uppercase tracking-[0.04em]" style={{ color }}>
          {RISK_LABEL[band]}
        </span>
      </div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {SEGMENTS.map((seg) => {
          const filled = score >= seg.to ? 1 : score <= seg.from ? 0 : (score - seg.from) / (seg.to - seg.from);
          return (
            <span key={seg.band} className="relative flex-1 bg-[var(--panel-2)]">
              <span
                className="absolute inset-y-0 left-0"
                style={{ width: `${filled * 100}%`, background: riskSheen(RISK_META[seg.band].color) }}
              />
            </span>
          );
        })}
      </div>
      <p className="text-[12px] leading-[16px] text-[var(--text-low)]">
        0 to 100. Praxis blocks at 80 and flags for review at 30.
      </p>
    </div>
  );
}
