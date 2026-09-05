export function sui(value: string | bigint): string {
  const amount = BigInt(value);
  const fraction = (amount % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return `${amount / 1_000_000_000n}${fraction ? `.${fraction}` : ""}`;
}
export function toMist(value: string): string {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,9})?$/.test(value.trim())) throw new Error("Enter a SUI amount with up to 9 decimal places");
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = BigInt(whole!) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  if (amount <= 0n || amount > 18446744073709551615n) throw new Error("Amount is outside the supported range");
  return amount.toString();
}
export function shortAddress(value: string) { return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value; }
export function dateLabel(value: Date | string) { return new Date(value).toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"; }
