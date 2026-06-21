import { Bot, ShieldCheck, Wallet, ArrowDown } from "lucide-react";

/**
 * The three-party model: Agent -> Praxis -> Wallet, with the report flowing back
 * to the agent and the audit trail underneath. The connectors animate a synced
 * flow (see globals.css "Three-party flow animation"): a pulse runs Agent ->
 * Praxis, Praxis glows as it evaluates, then a pulse runs Praxis -> Wallet while
 * a report pulse returns to the agent, and a sweep crosses the Walrus bar.
 * Hidden under prefers-reduced-motion. On mobile the cards stack with a simple
 * down-arrow connector (no horizontal beams).
 */
export function ThreePartyDiagram() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1.4fr_auto_1fr]">
        <Node icon={Bot} title="Agent" line="decides what to spend" />
        <Connector forwardLabel="builds intent" backLabel="report" fwdClass="flow-a" />
        <Node icon={ShieldCheck} title="Praxis" line="simulate / risk-score / gate" accent />
        <Connector forwardLabel="signs if it passes" fwdClass="flow-b" />
        <Node icon={Wallet} title="Wallet" line="signs the transaction" />
      </div>
      <div className="glass relative overflow-hidden rounded-[var(--r-md)] px-4 py-3 text-center text-[13px] text-[var(--text-mid)]">
        <span className="flow-walrus-sweep" aria-hidden="true" />
        Every decision is written to a Walrus audit trail with a tamper-evident on-chain receipt.
      </div>
    </div>
  );
}

function Node({
  icon: Icon,
  title,
  line,
  accent = false,
}: {
  icon: typeof Bot;
  title: string;
  line: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`glass relative flex flex-col items-center gap-2 rounded-[var(--r-md)] p-5 text-center ${
        accent ? "glow-accent" : ""
      }`}
    >
      {accent ? <span className="flow-node-ring" aria-hidden="true" /> : null}
      <Icon
        className="h-6 w-6"
        style={{ color: accent ? "var(--accent)" : "var(--text-mid)" }}
        aria-hidden="true"
      />
      <span className="text-[15px] font-semibold text-[var(--text-hi)]">{title}</span>
      <span className="text-[12px] leading-[16px] text-[var(--text-mid)]">{line}</span>
    </div>
  );
}

function Connector({
  forwardLabel,
  backLabel,
  fwdClass,
}: {
  forwardLabel: string;
  backLabel?: string;
  fwdClass: string;
}) {
  return (
    <div className="flex items-center justify-center px-1 py-1 sm:px-2 sm:py-0">
      {/* Mobile: simple down arrow between stacked cards. */}
      <ArrowDown className="h-4 w-4 text-[var(--text-low)] sm:hidden" aria-hidden="true" />

      {/* Desktop: animated flow beams with labels. */}
      <div className="hidden w-[132px] flex-col items-center gap-2 sm:flex">
        <span className="text-[11px] font-medium leading-none text-[var(--text-mid)]">{forwardLabel}</span>
        <Beam animClass={fwdClass} />
        {backLabel ? (
          <>
            <Beam animClass="flow-back" />
            <span className="text-[11px] font-medium leading-none text-[var(--text-mid)]">{backLabel}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Beam({ animClass }: { animClass: string }) {
  return (
    <span className="relative h-[3px] w-full rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18)_15%,rgba(255,255,255,0.18)_85%,transparent)]">
      <span className={`flow-pulse ${animClass}`} aria-hidden="true" />
    </span>
  );
}
