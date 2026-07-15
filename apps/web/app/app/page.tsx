import { Bot } from "lucide-react";
import { AgentCard } from "@/components/blocks/AgentCard";
import { LiveSpendStream } from "@/components/blocks/LiveSpendStream";
import { EmptyState } from "@/components/blocks/EmptyState";
import { LatestIntervention } from "@/components/blocks/LatestIntervention";
import { DecisionSummaryBar } from "@/components/blocks/DecisionSummaryBar";
import { getIndexStats, getStream, getAgents } from "@/lib/praxis.server";
import { INSTALL_SPEND_SNIPPET } from "@/lib/snippets";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  // All reads run server-side via PraxisReader, serialized to plain props.
  const [stats, stream, agents] = await Promise.all([
    getIndexStats(),
    getStream(50),
    getAgents(200),
  ]);
  const latestIntervention = stream.find((entry) => entry.status === "aborted") ?? stream[0];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-mid)]">
          Decision control room
        </span>
        <h1 className="font-display text-[30px] font-semibold leading-[36px] tracking-[-0.025em] text-[var(--text-hi)]">
          Agent spending, with evidence.
        </h1>
        <p className="max-w-[64ch] text-[15px] leading-6 text-[var(--text-mid)]">
          Every signed or blocked decision, from pre-flight simulation to its Walrus audit trail.
        </p>
      </div>

      {latestIntervention ? <LatestIntervention entry={latestIntervention} /> : null}

      <DecisionSummaryBar initial={stats} />

      <LiveSpendStream initial={stream} />

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-[17px] font-semibold leading-[24px] tracking-[-0.01em] text-[var(--text-hi)]">
            Agent inventory
          </h2>
          <span className="font-mono text-[12px] text-[var(--text-low)]">
            {agents.length} observed
          </span>
        </div>
        {agents.length === 0 ? (
          <EmptyState
            icon={Bot}
            headline="No agents seen yet."
            body="Once a spend runs through the SDK, the agent that submitted it appears here."
            snippet={INSTALL_SPEND_SNIPPET}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.address} agent={agent} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
