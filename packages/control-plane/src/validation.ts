import { normalizeSuiAddress as mystenNormalizeSuiAddress } from "@mysten/sui/utils";
import { DomainError } from "./errors";

export const SUI_TYPE = "0x2::sui::SUI" as const;
export const U64_MAX = 18_446_744_073_709_551_615n;

/** Parse only canonical, positive decimal MIST within the Move u64 range. */
export function parseMist(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new DomainError("INVALID_AMOUNT", "amount must be a canonical unsigned decimal");
  }
  const amount = BigInt(value);
  if (amount === 0n) throw new DomainError("INVALID_AMOUNT", "amount must be positive");
  if (amount > U64_MAX) throw new DomainError("INVALID_AMOUNT", "amount exceeds u64");
  return amount;
}

export const parseAmountMist = parseMist;
export const parseAmount = parseMist;

/**
 * Mysten's convenience normalizer intentionally accepts loose input for RPC
 * ergonomics.  Domain boundaries use a strict Sui address grammar first, then
 * use the canonical 32-byte lowercase representation.
 */
export function normalizeSuiAddress(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) {
    throw new DomainError("INVALID_ADDRESS", "address must be a valid Sui address");
  }
  try {
    const normalized = mystenNormalizeSuiAddress(value);
    if (!/^0x[0-9a-f]{64}$/.test(normalized)) throw new Error("normalizer returned an invalid address");
    return normalized;
  } catch (error) {
    throw new DomainError("INVALID_ADDRESS", "address must be a valid Sui address", { cause: error });
  }
}

export const normalizeAddress = normalizeSuiAddress;
export const parseSuiAddress = normalizeSuiAddress;

export function assertSuiCoinType(value: unknown): typeof SUI_TYPE {
  if (value !== SUI_TYPE) throw new DomainError("INVALID_COIN_TYPE", "only the exact SUI coin type is supported");
  return SUI_TYPE;
}

export const parseCoinType = assertSuiCoinType;
export const validateCoinType = assertSuiCoinType;
