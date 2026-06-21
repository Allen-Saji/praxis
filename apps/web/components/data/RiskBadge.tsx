import { ShieldCheck, AlertTriangle, Flame, OctagonAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RiskBand } from "@/lib/risk";
import { RISK_LABEL } from "@/lib/risk";

/**
 * The single source of truth for risk color. Default style is a tinted chip:
 * the risk color at ~14% alpha as background, the full color as text, plus the
 * required Lucide icon so color is never the sole signal (DESIGN.md section 5).
 */
const RISK_META: Record<RiskBand, { icon: LucideIcon; color: string; tint: string }> = {
  low: { icon: ShieldCheck, color: "var(--risk-low)", tint: "var(--risk-low-tint)" },
  medium: { icon: AlertTriangle, color: "var(--risk-medium)", tint: "var(--risk-medium-tint)" },
  high: { icon: Flame, color: "var(--risk-high)", tint: "var(--risk-high-tint)" },
  critical: { icon: OctagonAlert, color: "var(--risk-critical)", tint: "var(--risk-critical-tint)" },
};

export function RiskBadge({
  level,
  showLabel = true,
  className,
}: {
  level: RiskBand;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = RISK_META[level];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-0.5 text-[12px] font-medium leading-[16px]",
        className,
      )}
      style={{ backgroundColor: meta.tint, color: meta.color }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {showLabel ? <span>{RISK_LABEL[level]}</span> : null}
    </span>
  );
}

/**
 * Glossy top-sheen fill for risk bars: lighter at the top, full color at the
 * bottom, so a flat segment reads as a lit capsule instead of paint. color is a
 * `var(--risk-*)` token; color-mix keeps the sheen tied to the live token value.
 */
export function riskSheen(color: string): string {
  return `linear-gradient(180deg, color-mix(in srgb, ${color} 68%, #fff), ${color})`;
}

/** Color-matched luminous glow for a risk numeral, the way the cyan stat glows. */
export function riskGlow(color: string): string {
  return `0 0 14px color-mix(in srgb, ${color} 45%, transparent)`;
}

export { RISK_META };
