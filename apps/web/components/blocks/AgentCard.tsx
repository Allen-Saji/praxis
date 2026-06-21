import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Address } from "@/components/data/Address";
import { Timestamp } from "@/components/data/Timestamp";
import { RiskDistribution } from "./RiskDistribution";
import { formatPercent, withThousands } from "@/lib/format";
import type { SerializedAgent } from "@/lib/serialized";

/**
 * Per-agent summary card: address, spend/abort counts, abort rate, last
 * activity, risk-mix mini bar. Links to the agent profile. A high abort rate is
 * a good sign (drains prevented), so it is shown plainly, not as an alarm.
 */
export function AgentCard({ agent }: { agent: SerializedAgent }) {
  return (
    <Link
      href={`/app/agents/${agent.address}`}
      className="group glass flex flex-col gap-3 rounded-[var(--r-md)] p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[var(--accent)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[14px] text-[var(--text-hi)]" title={agent.address}>
          {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
        </span>
        <ChevronRight className="h-4 w-4 text-[var(--text-low)] transition-transform duration-150 group-hover:translate-x-0.5" />
      </div>

      <div className="flex items-baseline gap-4">
        <Metric label="spends" value={withThousands(String(agent.spendCount))} />
        <Metric label="aborts" value={withThousands(String(agent.abortCount))} />
        <Metric label="abort rate" value={formatPercent(agent.abortRate)} />
      </div>

      <RiskDistribution counts={agent.riskMix} showLegend={false} />

      <span className="text-[12px] text-[var(--text-low)]">
        last activity{" "}
        {agent.lastActivityMs > 0 ? <Timestamp ms={agent.lastActivityMs} /> : "none"}
      </span>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="tabular font-mono text-[16px] leading-[20px] text-[var(--text-hi)]">
        {value}
      </span>
      <span className="text-[11px] uppercase tracking-[0.04em] text-[var(--text-mid)]">
        {label}
      </span>
    </span>
  );
}
