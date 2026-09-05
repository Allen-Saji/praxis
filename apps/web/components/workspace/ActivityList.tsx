import Link from "next/link";
import { dateLabel, shortAddress, sui } from "@/lib/workspace-display";
import { StatePill, Empty } from "./WorkspaceFrame";
type Decision = { id: string; agentId: string; amountMist: string; recipient: string; state: string; createdAt: Date };
export function ActivityList({ slug, decisions, agents }: { slug: string; decisions: Decision[]; agents: Array<{ id: string; name: string }> }) {
  if (!decisions.length) return <Empty>No activity yet. Requests from your agents will appear here.</Empty>;
  return <div className="overflow-hidden rounded-xl border border-[var(--border)]">
    <div className="hidden grid-cols-[1fr_1fr_1fr_.7fr_1fr] gap-4 border-b border-[var(--divider)] px-4 py-3 text-xs text-[var(--text-low)] md:grid"><span>Time</span><span>Agent</span><span>Recipient</span><span>Amount</span><span>Result</span></div>
    {decisions.map((decision) => <Link key={decision.id} href={`/app/workspaces/${slug}/decisions/${decision.id}`} className="focus-ring grid grid-cols-2 items-center gap-3 border-b border-[var(--divider)] px-4 py-4 text-sm last:border-0 hover:bg-white/[0.025] md:grid-cols-[1fr_1fr_1fr_.7fr_1fr]"><time className="text-xs text-[var(--text-low)]" dateTime={decision.createdAt.toISOString()}>{dateLabel(decision.createdAt)}</time><span className="truncate">{agents.find((agent) => agent.id === decision.agentId)?.name ?? "Archived agent"}</span><span title={decision.recipient} className="font-mono text-xs text-[var(--text-mid)]">{shortAddress(decision.recipient)}</span><span className="font-mono text-xs">{sui(decision.amountMist)} SUI</span><span className="col-span-2 md:col-span-1"><StatePill value={decision.state} /></span></Link>)}
  </div>;
}
