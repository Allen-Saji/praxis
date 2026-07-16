import { Bot, FileCheck2, ShieldCheck, WalletCards } from "lucide-react";

const BOUNDARIES = [
  {
    icon: Bot,
    actor: "Agent",
    title: "Decides, but never receives the private key.",
    body: "The agent submits intent and receives the simulation report before it confirms or aborts.",
  },
  {
    icon: ShieldCheck,
    actor: "Praxis",
    title: "Simulates, scores, and enforces policy.",
    body: "Seven built-in risk rules inspect the dry-run result before any request reaches signing.",
  },
  {
    icon: WalletCards,
    actor: "Wallet",
    title: "Keeps signing authority.",
    body: "The wallet adapter signs only after the simulation and policy gate return a proceed decision.",
  },
  {
    icon: FileCheck2,
    actor: "Audit",
    title: "Records both approvals and interventions.",
    body: "Walrus reasoning and a tamper-evident on-chain receipt preserve why a spend ran or stopped.",
  },
];

/** Trust is explained as explicit authority boundaries, not generic security claims. */
export function TrustBoundary() {
  return (
    <section className="border-y border-white/[0.07] bg-[rgba(8,10,13,0.9)]" aria-labelledby="trust-title">
      <div className="mx-auto w-full max-w-[1080px] px-5 py-20 md:py-28">
        <div className="grid gap-10 md:grid-cols-[0.75fr_1.25fr] md:gap-16">
          <div>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Authority stays separated
            </span>
            <h2
              id="trust-title"
              className="mt-4 max-w-[13ch] font-display text-[clamp(32px,4.5vw,54px)] font-semibold leading-[1.03] tracking-[-0.035em] text-[var(--text-hi)]"
            >
              The agent decides. The wallet keeps control.
            </h2>
            <p className="mt-6 max-w-[44ch] text-[16px] leading-7 text-[var(--text-mid)]">
              Praxis is the evidence-producing boundary between autonomous intent and wallet authority.
            </p>
          </div>

          <div className="border-t border-white/10">
            {BOUNDARIES.map(({ icon: Icon, actor, title, body }) => (
              <div
                key={actor}
                className="grid gap-3 border-b border-white/10 py-5 sm:grid-cols-[104px_minmax(0,1fr)] sm:gap-5"
              >
                <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-low)]">
                  <Icon className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                  {actor}
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold leading-6 text-[var(--text-hi)]">{title}</h3>
                  <p className="mt-1.5 text-[16px] leading-7 text-[var(--text-mid)]">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-3 border border-dashed border-white/15 px-5 py-4 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-low)] sm:grid-cols-3">
          <span>v1 / Sui testnet</span>
          <span>asset / SUI only</span>
          <span>sealed reasoning / local Seal stand-in</span>
        </div>
      </div>
    </section>
  );
}
