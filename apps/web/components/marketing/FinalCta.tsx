import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

/** Final conversion moment after the problem, evidence, trust, and adoption story. */
export function FinalCta() {
  return (
    <section className="border-t border-white/[0.07] bg-[rgba(9,12,16,0.88)]">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col items-start justify-between gap-8 px-5 py-16 sm:flex-row sm:items-center md:py-20">
        <div>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
            Decision boundary ready
          </span>
          <h2 className="mt-3 max-w-[20ch] font-display text-[clamp(28px,4vw,44px)] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--text-hi)]">
            Let the agent act. Keep every spend accountable.
          </h2>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/docs"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--r-sm)] bg-[var(--accent)] px-5 text-[14px] font-semibold text-[#04121a] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Start with the SDK
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/app"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--r-sm)] border border-white/15 px-5 text-[14px] font-medium text-[var(--text-hi)] transition-colors duration-150 hover:border-white/30 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <ShieldCheck className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            Open dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}
