import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

/** Launch identity shared with the Praxis Guard profile and social preview. */
export function HeroPremium() {
  return (
    <>
      <h1
        className="rise max-w-[19ch] text-[clamp(38px,6.5vw,68px)] font-semibold leading-[1.08] tracking-[-0.025em] text-[var(--text-hi)]"
      >
        Your agents act.
        <span className="block text-[var(--accent)]">You set the limits.</span>
      </h1>

      <p
        className="rise max-w-[58ch] text-[clamp(16px,1.6vw,19px)] leading-[1.55] text-[var(--text-mid)]"
      >
        Spending controls for AI agents. Set policies and budgets, simulate payments
        before signing, and verify why each decision passed or was blocked.
      </p>

      <div
        className="rise flex flex-wrap items-center justify-center gap-3"
      >
        <Link
          href="/docs"
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[var(--r-sm)] bg-[var(--accent)] px-5 text-[15px] font-semibold text-[#04121a] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
    </>
  );
}
