import { Bot } from "lucide-react";
import { AgentCard } from "@/components/blocks/AgentCard";
import { EmptyState } from "@/components/blocks/EmptyState";
import { getAgents } from "@/lib/praxis.server";
import { INSTALL_SPEND_SNIPPET } from "@/lib/snippets";
import { withThousands } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const agents = await getAgents(200);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-semibold leading-[36px] tracking-tight text-[var(--text-hi)]">
          Agents
        </h1>
        <p className="text-[14px] text-[var(--text-mid)]">
          {agents.length > 0
            ? `${withThousands(String(agents.length))} agents seen in recent activity.`
            : "Agents derived from recent receipt and abort events."}
        </p>
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
    </div>
  );
}
