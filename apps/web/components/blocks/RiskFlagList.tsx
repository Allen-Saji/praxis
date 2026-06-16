import { cn } from "@/lib/cn";
import { RiskBadge } from "@/components/data/RiskBadge";
import type { Risk, PolicyViolation } from "@/lib/serialized";

/** Renders SimulationReport.risks[] as RiskBadge + code + message rows. */
export function RiskFlagList({ risks, className }: { risks: Risk[]; className?: string }) {
  if (risks.length === 0) {
    return (
      <p className={cn("text-[13px] leading-[20px] text-[var(--text-low)]", className)}>
        No risk flags raised by the simulation.
      </p>
    );
  }
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {risks.map((risk, i) => (
        <li
          key={`${risk.code}-${i}`}
          className="flex items-start gap-3 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2"
        >
          <RiskBadge level={risk.level} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-mono text-[13px] leading-[18px] text-[var(--text-hi)]">
              {risk.code}
            </div>
            <div className="text-[13px] leading-[18px] text-[var(--text-mid)]">{risk.message}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Renders policy_check.violations[] as code + message rows. */
export function PolicyViolationList({
  violations,
  className,
}: {
  violations: PolicyViolation[];
  className?: string;
}) {
  if (violations.length === 0) {
    return (
      <p className={cn("text-[13px] leading-[20px] text-[var(--text-low)]", className)}>
        No policy violations.
      </p>
    );
  }
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {violations.map((v, i) => (
        <li
          key={`${v.code}-${i}`}
          className="flex items-start gap-3 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2"
        >
          <span className="mt-0.5 shrink-0 font-mono text-[12px] text-[var(--risk-critical)]">
            {v.code}
          </span>
          <span className="text-[13px] leading-[18px] text-[var(--text-mid)]">{v.message}</span>
        </li>
      ))}
    </ul>
  );
}
