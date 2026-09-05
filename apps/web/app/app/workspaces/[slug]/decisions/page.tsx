import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace-view.server";
import { workspaceRepository } from "@/lib/control-plane.server";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { ActivityList } from "@/components/workspace/ActivityList";
export const dynamic = "force-dynamic";
const states = ["confirmed", "blocked", "submission_unknown", "evidence_pending", "abort_record_pending", "failed", "expired"] as const;
export default async function Activity({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ before?: string; agent?: string; state?: string; period?: string; attention?: string }> }) {
  const { slug } = await params; const query = await searchParams; const context = await requireWorkspace(slug); const repository = workspaceRepository();
  const overview = await repository.workspaceOverview(context.organization.id, context.session.user.id);
  const state = states.find((item) => item === query.state); const agentId = overview?.agents.find((item) => item.id === query.agent)?.id;
  // Invalid filter IDs never broaden a query to all workspace activity.
  const invalidAgent = !!query.agent && !agentId;
  const since = query.period === "today" ? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z") : query.period === "week" ? new Date(Date.now() - 7 * 86_400_000) : undefined;
  const result = invalidAgent ? null : await repository.decisionsForMember({ organizationId: context.organization.id, userId: context.session.user.id, agentId, state, since, attention: query.attention === "1", before: decodeCursor(query.before) });
  const last = result?.decisions.at(-1); const next = new URLSearchParams(); for (const key of ["agent", "state", "period", "attention"] as const) if (query[key]) next.set(key, query[key]!); if (last) next.set("before", Buffer.from(JSON.stringify([last.createdAt.toISOString(), last.id])).toString("base64url"));
  const field = "focus-ring min-h-11 rounded border border-[var(--border)] bg-[var(--panel)] px-3 text-sm";
  return <WorkspaceFrame slug={slug} name={context.organization.name} title="Activity" description="Payments and blocked requests from your agents.">
    <form className="flex flex-wrap gap-3"><select name="agent" aria-label="Filter by agent" defaultValue={agentId ?? ""} className={field}><option value="">All agents</option>{overview?.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><select name="state" aria-label="Filter by result" defaultValue={state ?? ""} className={field}><option value="">All results</option>{states.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><select name="period" aria-label="Filter by date" defaultValue={query.period ?? ""} className={field}><option value="">All time</option><option value="today">Today, UTC</option><option value="week">Past 7 days</option></select><button className={`${field} text-[var(--accent)]`}>Apply filters</button><Link className="focus-ring inline-flex min-h-11 items-center px-2 text-sm" href={`/app/workspaces/${slug}/decisions`}>Clear</Link></form>
    {query.attention === "1" ? <p className="text-sm text-[var(--risk-medium)]">Showing requests awaiting evidence or an audit record.</p> : null}
    <ActivityList slug={slug} decisions={result?.decisions ?? []} agents={overview?.agents ?? []} />
    {result?.hasMore ? <Link className="focus-ring inline-flex min-h-11 items-center text-sm text-[var(--accent)]" href={`?${next}`}>Older activity</Link> : null}
  </WorkspaceFrame>;
}
function decodeCursor(value?: string) { if (!value) return undefined; try { const data = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); if (!Array.isArray(data) || typeof data[0] !== "string" || typeof data[1] !== "string" || !/^[0-9a-f-]{36}$/.test(data[1])) return undefined; const createdAt = new Date(data[0]); return Number.isFinite(createdAt.getTime()) ? { createdAt, id: data[1] } : undefined; } catch { return undefined; } }
