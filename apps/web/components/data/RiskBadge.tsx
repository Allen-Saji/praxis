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
  low: { icon: ShieldCheck, color: "var(--risk-low)", tint: "rgba(74,222,128,0.14)" },
  medium: { icon: AlertTriangle, color: "var(--risk-medium)", tint: "rgba(251,191,36,0.14)" },
  high: { icon: Flame, color: "var(--risk-high)", tint: "rgba(251,146,60,0.14)" },
  critical: { icon: OctagonAlert, color: "var(--risk-critical)", tint: "rgba(244,81,108,0.14)" },
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

export { RISK_META };
