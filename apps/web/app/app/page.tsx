import { Bot } from "lucide-react";
import { StatHeader } from "@/components/blocks/StatHeader";
import { AgentCard } from "@/components/blocks/AgentCard";
import { LiveSpendStream } from "@/components/blocks/LiveSpendStream";
import { EmptyState } from "@/components/blocks/EmptyState";
import { getIndexStats, getRecentReceipts, getAgents } from "@/lib/praxis.server";
import { INSTALL_SPEND_SNIPPET } from "@/lib/snippets";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  // All reads run server-side via PraxisReader, serialized to plain props.
  const [stats, receipts, agents] = await Promise.all([
    getIndexStats(),
    getRecentReceipts(50),
    getAgents(200),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-semibold leading-[36px] tracking-tight text-[var(--text-hi)]">
          Dashboard
        </h1>
        <p className="text-[14px] text-[var(--text-mid)]">
          Live agent spend, simulation reports, and the audit trail on Sui testnet.
        </p>
      </div>

      <StatHeader initialStats={stats} agents={agents} />

      <section className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold leading-[24px] text-[var(--text-hi)]">Agents</h2>
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

      <LiveSpendStream initial={receipts} />
    </div>
  );
}
