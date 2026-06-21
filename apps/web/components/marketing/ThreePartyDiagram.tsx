import { Bot, ShieldCheck, Wallet } from "lucide-react";

/**
 * The three-party model: agent -> praxis -> wallet, with the report flowing back
 * and the audit trail underneath. Plain SVG-free layout (flex + lucide), no
 * decorative gradient, per the anti-patterns. Static, no animation.
 */
export function ThreePartyDiagram() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1.4fr_auto_1fr]">
        <Node icon={Bot} title="Agent" line="decides what to spend" />
        <Connector forward="builds intent" back="report" />
        <Node
          icon={ShieldCheck}
          title="Praxis"
          line="simulate / risk-score / gate"
          accent
        />
        <Connector forward="signs if it passes" />
        <Node icon={Wallet} title="Wallet" line="signs the transaction" />
      </div>
      <div className="glass rounded-[var(--r-md)] px-4 py-3 text-center text-[13px] text-[var(--text-mid)]">
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
      className={`glass flex flex-col items-center gap-2 rounded-[var(--r-md)] p-5 text-center ${
        accent ? "glow-accent" : ""
      }`}
    >
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

function Connector({ forward, back }: { forward: string; back?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-1 py-2 sm:py-0">
      <span className="text-[11px] text-[var(--text-low)]">{forward}</span>
      <span className="font-mono text-[var(--accent)]" aria-hidden="true">
        {"->"}
      </span>
      {back ? (
        <>
          <span className="font-mono text-[var(--text-low)]" aria-hidden="true">
            {"<-"}
          </span>
          <span className="text-[11px] text-[var(--text-low)]">{back}</span>
        </>
      ) : null}
    </div>
  );
}
