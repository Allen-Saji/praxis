import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";

const QUICKSTART = `const result = await praxis.spend({
  to: recipient,
  amount: 5_000_000n,
  reasoning: { prompt, decision, model },
  onReport: (report) =>
    report.recommendation === "proceed",
});

// confirmed | aborted + simulationReport`;

/** A concrete adoption step for the builder who has accepted the product premise. */
export function DeveloperQuickstart() {
  return (
    <section className="bg-[rgba(5,7,10,0.94)]" aria-labelledby="quickstart-title">
      <div className="mx-auto grid w-full max-w-[1080px] gap-10 px-5 py-20 md:grid-cols-[0.78fr_1.22fr] md:items-center md:gap-16 md:py-28">
        <div>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
            One guarded spend path
          </span>
          <h2
            id="quickstart-title"
            className="mt-4 max-w-[12ch] font-display text-[clamp(32px,4.5vw,54px)] font-semibold leading-[1.03] tracking-[-0.035em] text-[var(--text-hi)]"
          >
            Put the report inside the agent loop.
          </h2>
          <p className="mt-6 max-w-[44ch] text-[16px] leading-7 text-[var(--text-mid)]">
            The agent sees simulated balance changes, gas, risk findings, and the gate recommendation before it decides whether to continue.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/docs"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--r-sm)] bg-[var(--accent)] px-5 text-[14px] font-semibold text-[#04121a] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Read the quickstart
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="https://github.com/Allen-Saji/praxis"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--r-sm)] border border-white/15 px-5 text-[14px] font-medium text-[var(--text-hi)] transition-colors duration-150 hover:border-white/30 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <Github className="h-4 w-4" aria-hidden="true" />
              View source
            </Link>
          </div>
        </div>

        <div className="overflow-hidden border border-white/10 bg-[#080b0f] shadow-[0_28px_90px_-45px_rgba(0,210,255,0.42)]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-low)]">
              agent-spend.ts
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--risk-low)]">
              pre-sign gate
            </span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6 text-[var(--text-mid)] sm:p-7">
            <code>{QUICKSTART}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
