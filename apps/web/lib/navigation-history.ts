export const INTERNAL_NAVIGATION_KEY = "praxis:internal-navigation";

export function isSameOriginReferrer(referrer: string, origin: string): boolean {
  if (!referrer) {
    return false;
  }

  try {
    return new URL(referrer).origin === origin;
  } catch {
    return false;
  }
}

export function canUseBrowserBack(
  internalNavigation: string | null,
  historyLength: number,
): boolean {
  return internalNavigation === "1" && historyLength > 1;
}
