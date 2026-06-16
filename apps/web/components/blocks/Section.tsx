import { cn } from "@/lib/cn";

/** A titled detail section with an optional right-aligned aside. */
export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--panel)] p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold uppercase tracking-[0.04em] text-[var(--text-hi)]">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
