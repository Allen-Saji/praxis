import { cn } from "@/lib/cn";
import { Address } from "@/components/data/Address";
import { Amount } from "@/components/data/Amount";
import { coinSymbol } from "@/lib/format";
import type { BalanceDelta } from "@/lib/serialized";

/** A single signed balance delta: owner + coin + signed amount (red out, green in). */
export function BalanceChangeRow({ change }: { change: BalanceDelta }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        <Address value={change.owner} kind="account" copy link={false} />
        <span className="text-[12px] text-[var(--text-low)]">{coinSymbol(change.coinType)}</span>
      </div>
      <Amount mist={change.amount} coinType={change.coinType} signed />
    </div>
  );
}

export function BalanceChangeList({
  changes,
  className,
}: {
  changes: BalanceDelta[];
  className?: string;
}) {
  if (changes.length === 0) {
    return (
      <p className={cn("text-[13px] leading-[20px] text-[var(--text-low)]", className)}>
        No balance changes in the dry-run.
      </p>
    );
  }
  return (
    <div className={cn("flex flex-col", className)}>
      {changes.map((c, i) => (
        <BalanceChangeRow key={`${c.owner}-${c.coinType}-${i}`} change={c} />
      ))}
    </div>
  );
}
