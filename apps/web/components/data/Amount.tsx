import { cn } from "@/lib/cn";
import { formatSui, coinSymbol } from "@/lib/format";

/**
 * A MIST amount formatted to SUI, right-aligned mono with the coin symbol. V1 is
 * SUI-only per the SDK guard. `signed` colors outflow red and inflow green for
 * balance-change rows.
 */
export function Amount({
  mist,
  coinType = "0x2::sui::SUI",
  signed = false,
  decimals = 4,
  className,
}: {
  mist: string;
  coinType?: string;
  signed?: boolean;
  decimals?: number;
  className?: string;
}) {
  const formatted = formatSui(mist, decimals);
  const negative = formatted.startsWith("-");
  const color = signed
    ? negative
      ? "var(--risk-critical)"
      : "var(--risk-low)"
    : "var(--text-hi)";
  const display = signed && !negative ? `+${formatted}` : formatted;

  return (
    <span
      className={cn("tabular font-mono text-[14px] leading-[20px]", className)}
      style={{ color }}
    >
      {display}
      <span className="ml-1 text-[var(--text-low)]">{coinSymbol(coinType)}</span>
    </span>
  );
}
