export const SESSION_REVALIDATION_INTERVAL_MS = 60_000;

export type SessionCheckOutcome = "valid" | "invalid" | "unavailable";

export function verifiedAddressBeforeRevalidation(
  currentAddress: string | null,
  resumed: boolean,
) {
  return resumed ? null : currentAddress;
}

export function verifiedAddressAfterCheck(
  currentAddress: string | null,
  expectedAddress: string,
  outcome: SessionCheckOutcome,
) {
  if (outcome === "valid") return expectedAddress;
  if (outcome === "invalid") return null;
  return currentAddress;
}
