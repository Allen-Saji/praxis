import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

/**
 * Premium command-deck hero. Sits over the live WebGL aurora (GradientField).
 * Gradient-clipped headline, one-line subhead, two CTAs. Staggered reveal on
 * load, capped at 400ms, gated on prefers-reduced-motion via .rise.
 */
export function HeroPremium() {
  return (
    <section className="relative mx-auto flex w-full max-w-[920px] flex-col items-center gap-7 px-5 pt-24 pb-16 text-center">
      <span
        className="rise glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--text-mid)]"
        style={{ animationDelay: "0ms" }}
      >
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--risk-low)]" aria-hidden="true" />
        Testnet live
      </span>

      <h1
        className="rise text-gradient max-w-[16ch] text-[clamp(40px,6.5vw,68px)] font-semibold leading-[1.04] tracking-[-0.02em]"
        style={{ animationDelay: "60ms" }}
      >
        A safety layer between your AI agent and its wallet.
      </h1>

      <p
        className="rise max-w-[58ch] text-[clamp(16px,1.6vw,19px)] leading-[1.55] text-[var(--text-mid)]"
        style={{ animationDelay: "120ms" }}
      >
        Praxis simulates and risk-scores every spend before it signs, and writes the
        reasoning to a verifiable audit trail.
      </p>

      <div
        className="rise flex flex-wrap items-center justify-center gap-3"
        style={{ animationDelay: "180ms" }}
      >
        <Link
          href="/docs"
          className="glow-accent inline-flex h-11 cursor-pointer items-center gap-2 rounded-[var(--r-sm)] bg-[var(--accent)] px-5 text-[15px] font-semibold text-[#04121a] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Read the quickstart
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/app"
          className="glass inline-flex h-11 cursor-pointer items-center gap-2 rounded-[var(--r-sm)] px-5 text-[15px] font-medium text-[var(--text-hi)] transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
          Open the dashboard
        </Link>
      </div>
    </section>
  );
}
