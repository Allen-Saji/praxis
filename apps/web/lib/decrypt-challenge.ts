/**
 * Canonical challenge string a viewer signs to prove control of their address
 * before the server will decrypt a sealed reasoning blob. Shared by the client
 * (which builds + signs it) and the server (which rebuilds + verifies it), so
 * the wording can never drift between the two sides.
 */
export function buildDecryptChallenge(
  blobId: string,
  viewer: string,
  issuedIso: string,
): string {
  return [
    "Praxis decrypt authorization",
    `blob: ${blobId}`,
    `viewer: ${viewer}`,
    `issued: ${issuedIso}`,
  ].join("\n");
}

/** Max age of a signed challenge the server will accept (replay window). */
export const DECRYPT_CHALLENGE_MAX_AGE_MS = 5 * 60 * 1000;
