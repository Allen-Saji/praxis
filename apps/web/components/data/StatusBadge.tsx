import { Check, Shield, CircleCheck, CircleX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Spend / simulation outcome badge. A confirmed spend is neutral (it is not
 * celebrated); an aborted spend uses the critical family but is framed as
 * protection in surrounding copy (DESIGN.md section 5).
 */
export type Status = "confirmed" | "aborted" | "sim_passed" | "sim_failed";

const STATUS_META: Record<
  Status,
  { icon: LucideIcon; label: string; color: string; tint: string }
> = {
  confirmed: { icon: Check, label: "Confirmed", color: "var(--text-mid)", tint: "rgba(155,161,168,0.12)" },
  aborted: { icon: Shield, label: "Aborted", color: "var(--risk-critical)", tint: "rgba(244,81,108,0.14)" },
  sim_passed: { icon: CircleCheck, label: "Passed", color: "var(--risk-low)", tint: "rgba(74,222,128,0.14)" },
  sim_failed: { icon: CircleX, label: "Failed", color: "var(--risk-critical)", tint: "rgba(244,81,108,0.14)" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-0.5 text-[12px] font-medium uppercase tracking-[0.03em] leading-[16px]",
        className,
      )}
      style={{ backgroundColor: meta.tint, color: meta.color }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
