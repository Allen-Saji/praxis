import { sui } from "@/lib/workspace-display";
import type { assignmentBudget } from "@/lib/workspace-model";

export function AgentBudget({ title, budget }: { title: string; budget: ReturnType<typeof assignmentBudget> }) {
  return <div className="min-w-0 rounded border border-[var(--border)] p-4">
    <h3 className="text-sm font-medium">{title}</h3>
    <p className="mt-3 break-words font-mono text-base">{budget.available === null ? "Limits not active" : `${sui(budget.available)} SUI left`}</p>
    {budget.limit !== null ? <p className="mt-1 text-xs text-[var(--text-low)]">of {sui(budget.limit)} SUI individual limit</p> : null}
    <dl className="mt-4 space-y-2 text-xs text-[var(--text-mid)]">
      <div className="flex flex-wrap justify-between gap-2"><dt>Spent / pending</dt><dd>{sui(budget.spent)} / {sui(budget.reserved)} SUI</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt>Shared wallet remaining</dt><dd>{budget.sharedAvailable === null ? "Not set" : `${sui(budget.sharedAvailable)} SUI`}</dd></div>
    </dl>
    {budget.limitedByWallet ? <p className="mt-3 text-xs leading-5 text-[var(--risk-medium)]">The shared wallet currently limits this agent to {sui(budget.effectiveAvailable!)} SUI for this period.</p> : null}
  </div>;
}
