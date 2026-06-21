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
    <div className="group glass flex flex-col gap-3 rounded-[var(--r-md)] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[var(--accent)]/30">
      <span className="flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)] border border-white/10 bg-white/5 text-[var(--accent)] transition-shadow duration-200 group-hover:shadow-[0_0_22px_-4px_rgba(0,210,255,0.55)]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="text-[16px] font-semibold leading-[22px] text-[var(--text-hi)]">{title}</h3>
      <p className="text-[14px] leading-[21px] text-[var(--text-mid)]">{body}</p>
    </div>
  );
}
