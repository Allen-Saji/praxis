import { cn } from "@/lib/cn";

/** Explorer-style label/value line. Label muted, value in the UI face or mono. */
export function KeyValueRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-3 py-1.5", className)}>
      <dt className="w-28 shrink-0 text-[13px] leading-[20px] text-[var(--text-mid)]">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-[14px] leading-[20px] text-[var(--text-hi)]">
        {children}
      </dd>
    </div>
  );
}

/** Wrap a set of KeyValueRow in a semantic dl. */
export function KeyValueList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <dl className={cn("grid gap-0", className)}>{children}</dl>;
}
