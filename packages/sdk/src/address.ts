import { normalizeSuiAddress } from "@mysten/sui/utils";

/** Sui's normalizer is permissive; reject non-hex input before using it. */
export function normalizeSuiAddressStrict(value: string): string {
  if (typeof value !== "string" || !/^(?:0x)?[0-9a-f]{1,64}$/i.test(value.trim())) {
    throw new Error("invalid Sui address");
  }
  return normalizeSuiAddress(value.trim());
}
