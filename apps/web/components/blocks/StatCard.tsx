import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A labeled stat: caption + small corner icon + big mono number + optional sub
 * note. The featured variant (the drains-prevented card) is larger with an
 * accent underline and a glowing accent icon.
 */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  featured = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  featured?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass flex flex-col gap-3 rounded-[var(--r-md)] p-4",
        featured && "glow-accent",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-mid)]">
          {label}
        </span>
        {Icon ? (
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              featured
                ? "text-[var(--accent)] [filter:drop-shadow(0_0_8px_rgba(0,210,255,0.55))]"
                : "text-[var(--text-low)]",
            )}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <span
        className={cn(
          "tabular font-mono leading-none",
          featured
            ? "text-[34px] text-[var(--accent)] [text-shadow:0_0_24px_rgba(0,210,255,0.5)]"
            : "text-[26px] text-[var(--text-hi)]",
        )}
      >
        {value}
      </span>
      {featured ? (
        <span className="h-0.5 w-10 rounded-full bg-[var(--accent)]" aria-hidden="true" />
      ) : null}
      {sub ? <span className="text-[12px] leading-[16px] text-[var(--text-low)]">{sub}</span> : null}
    </div>
  );
}
