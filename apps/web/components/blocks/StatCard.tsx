import { cn } from "@/lib/cn";

/**
 * A labeled stat: caption + big mono number + optional sub note. The featured
 * variant (the drains-prevented card) is larger with an accent underline.
 */
export function StatCard({
  label,
  value,
  sub,
  featured = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  featured?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass flex flex-col gap-2 rounded-[var(--r-md)] p-4",
        featured && "glow-accent",
        className,
      )}
    >
      <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-mid)]">
        {label}
      </span>
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
