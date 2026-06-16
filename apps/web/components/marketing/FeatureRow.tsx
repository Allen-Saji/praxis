import type { LucideIcon } from "lucide-react";

/** A problem-first feature row. Problem framing beats a function list. */
export function FeatureRow({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--panel)] p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--panel-2)] text-[var(--accent)]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="text-[16px] font-semibold leading-[22px] text-[var(--text-hi)]">{title}</h3>
      <p className="text-[14px] leading-[21px] text-[var(--text-mid)]">{body}</p>
    </div>
  );
}
