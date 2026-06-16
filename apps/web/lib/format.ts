/**
 * Formatting helpers shared by client and server code. Pure functions only, no
 * Node built-ins, so these are safe to import into client components.
 */

const MIST_PER_SUI = 1_000_000_000n;

/** Format a MIST amount (string or bigint) to a fixed-decimal SUI string. */
export function formatSui(mist: string | bigint, decimals = 4): string {
  let value: bigint;
  try {
    value = typeof mist === "bigint" ? mist : BigInt(mist);
  } catch {
    return "0";
  }
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / MIST_PER_SUI;
  const frac = abs % MIST_PER_SUI;
  const fracStr = frac.toString().padStart(9, "0").slice(0, decimals);
  const sign = negative ? "-" : "";
  const wholeStr = withThousands(whole.toString());
  return decimals > 0 ? `${sign}${wholeStr}.${fracStr}` : `${sign}${wholeStr}`;
}

/** Group a digit string in thousands, e.g. "1204" -> "1,204". */
export function withThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Truncate a hex address/digest in the middle: 0x42780ec3...69d7. Keeps the
 * leading 0x plus `head` hex chars and `tail` trailing chars.
 */
export function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (!value) return "";
  const hasPrefix = value.startsWith("0x");
  const body = hasPrefix ? value.slice(2) : value;
  if (body.length <= head + tail) return value;
  const prefix = hasPrefix ? "0x" : "";
  return `${prefix}${body.slice(0, head)}...${body.slice(-tail)}`;
}

/** Truncate a non-hex id (Walrus blob ids, blake3) keeping head and tail. */
export function truncateId(value: string, head = 8, tail = 4): string {
  if (!value) return "";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

/** Decode a Move vector<u8> (number[]) into a UTF-8 string (Walrus blob id). */
export function bytesToString(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1_000],
];

/** "2m ago" style relative time from epoch ms. */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  if (abs < 5_000) return "just now";
  for (const [unit, msPer] of RELATIVE_UNITS) {
    if (abs >= msPer || unit === "second") {
      const value = Math.round(diff / msPer);
      return rtf.format(value, unit);
    }
  }
  return "just now";
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });

/** Absolute timestamp for titles/tooltips: 2026-06-16 14:08 UTC. */
export function absoluteTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())} UTC`;
}

/** Percent from a 0..1 ratio, no decimals. */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** Short coin symbol from a coin type. 0x2::sui::SUI -> SUI. */
export function coinSymbol(coinType: string): string {
  const parts = coinType.split("::");
  return parts[parts.length - 1]?.toUpperCase() ?? "SUI";
}
