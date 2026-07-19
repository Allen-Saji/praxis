import { StatCard } from "@/components/blocks/StatCard";
import { Address } from "@/components/data/Address";
import { Timestamp } from "@/components/data/Timestamp";
import { AgentProfileTabs } from "@/components/blocks/AgentProfileTabs";
import { BackButton } from "@/components/navigation/BackButton";
import { getReceiptsByAgent, getAbortsByAgent } from "@/lib/praxis.server";
import { formatPercent, withThousands } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgentProfile({
  params,
}: {
  params: Promise<{ addr: string }>;
}) {
  const { addr } = await params;
  const agent = decodeURIComponent(addr);

  const [receipts, aborts] = await Promise.all([
    getReceiptsByAgent(agent, 200),
    getAbortsByAgent(agent, 200),
  ]);

  const spendCount = receipts.length;
  const abortCount = aborts.length;
  const denom = spendCount + abortCount;
  const abortRate = denom === 0 ? 0 : abortCount / denom;
  const lastActivityMs = Math.max(
    0,
    ...receipts.map((r) => r.timestampMs),
    ...aborts.map((a) => a.timestampMs),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackButton fallbackHref="/app/agents" />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[22px] font-semibold leading-[28px] tracking-[-0.01em] text-[var(--text-hi)]">Agent</h1>
          <Address value={agent} kind="account" head={8} tail={6} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Spends" value={withThousands(String(spendCount))} />
        <StatCard label="Aborts" value={withThousands(String(abortCount))} />
        <StatCard label="Abort rate" value={formatPercent(abortRate)} />
        <StatCard
          label="Last activity"
          value={
            lastActivityMs > 0 ? (
              <span className="text-[18px]">
                <Timestamp ms={lastActivityMs} className="text-[18px] text-[var(--text-hi)]" />
              </span>
            ) : (
              <span className="text-[18px] text-[var(--text-low)]">none</span>
            )
          }
        />
      </div>

      <AgentProfileTabs receipts={receipts} aborts={aborts} />
    </div>
  );
}
