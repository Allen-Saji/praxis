import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { CodeBlock } from "@/components/blocks/CodeBlock";
import { HERO_SNIPPET } from "@/lib/snippets";
import { suiscanUrl } from "@/lib/explorer";
import { DEPLOYMENTS } from "@praxis/sdk";

/**
 * Landing hero. Short bold headline, one-line subhead, two CTAs, and the SDK
 * snippet as the hero visual (Evil Martians dev-tool pattern). Staggered reveal
 * on load, 400ms cap, gated on prefers-reduced-motion (DESIGN.md section 7).
 */
export function Hero() {
  const packageId = DEPLOYMENTS.testnet.packageId;
  return (
    <section className="mx-auto flex w-full max-w-[1080px] flex-col items-center gap-8 px-5 pt-16 pb-12 text-center">
      <span
        className="rise inline-flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-mid)]"
        style={{ animationDelay: "0ms" }}
      >
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--risk-low)]" aria-hidden="true" />
        Testnet live
      </span>

      <h1
        className="rise max-w-[18ch] text-[clamp(32px,5vw,48px)] font-semibold leading-[1.08] tracking-tight text-[var(--text-hi)]"
        style={{ animationDelay: "60ms" }}
      >
        A safety layer between your AI agent and its wallet.
      </h1>

      <p
        className="rise max-w-[62ch] text-[17px] leading-[26px] text-[var(--text-mid)]"
        style={{ animationDelay: "120ms" }}
      >
        Praxis simulates and risk-scores every spend before it signs, and writes the reasoning to
        an audit trail.
      </p>

      <div className="rise flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "180ms" }}>
        <Link
          href="/docs"
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--r-sm)] bg-[var(--accent)] px-4 text-[14px] font-medium text-[var(--bg)] transition-colors duration-150 hover:bg-[var(--accent-quiet)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Read the quickstart
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/app"
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--r-sm)] border border-[var(--border-hi)] bg-[var(--panel)] px-4 text-[14px] font-medium text-[var(--text-hi)] transition-colors duration-150 hover:bg-[var(--panel-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Open the dashboard
        </Link>
      </div>

      <div className="rise w-full max-w-[680px] text-left" style={{ animationDelay: "240ms" }}>
        <CodeBlock tabs={HERO_SNIPPET} />
        <div className="mt-3 flex justify-center">
          <Link
            href={suiscanUrl("object", packageId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            View the package on Suiscan
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
