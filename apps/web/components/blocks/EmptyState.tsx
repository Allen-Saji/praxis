import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { CodeBlock, type CodeTab } from "./CodeBlock";

/**
 * Purposeful empty state: icon + headline + one-line explanation + an optional
 * copyable snippet that produces the first row. No placeholder data anywhere
 * (DESIGN.md section 5, 11).
 */
export function EmptyState({
  icon: Icon,
  headline,
  body,
  snippet,
  className,
}: {
  icon: LucideIcon;
  headline: string;
  body: string;
  snippet?: CodeTab[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-[var(--r-md)] border border-dashed border-[var(--border)] bg-[var(--panel)] px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text-mid)]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h3 className="text-[17px] font-semibold leading-[24px] text-[var(--text-hi)]">
          {headline}
        </h3>
        <p className="text-[14px] leading-[20px] text-[var(--text-mid)]">{body}</p>
      </div>
      {snippet ? <CodeBlock tabs={snippet} className="w-full max-w-lg text-left" /> : null}
    </div>
  );
}
