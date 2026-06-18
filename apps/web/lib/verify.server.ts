import "server-only";

import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { buildDecryptChallenge, DECRYPT_CHALLENGE_MAX_AGE_MS } from "./decrypt-challenge";

export type AuthResult = { ok: true } | { ok: false; error: string };

/**
 * Prove the caller controls `viewer` before we decrypt anything. The client
 * signs the canonical challenge with the viewer's wallet; here we (1) rebuild
 * the exact challenge for this blob+viewer and confirm the signed message
 * matches it, (2) reject stale challenges, and (3) verify the signature and
 * confirm the recovered Sui address is the viewer. Without this, /api/decrypt
 * is an open oracle: anyone could name an allowlisted address and read sealed
 * reasoning off public Walrus.
 */
export async function verifyDecryptAuth(args: {
  blobId: string;
  viewer: string;
  message: string;
  signature: string;
}): Promise<AuthResult> {
  const { blobId, viewer, message, signature } = args;

  const issued = parseIssued(message);
  if (!issued) return { ok: false, error: "malformed authorization challenge" };

  if (message !== buildDecryptChallenge(blobId, viewer, issued)) {
    return { ok: false, error: "authorization challenge does not match this request" };
  }

  const issuedMs = Date.parse(issued);
  if (!Number.isFinite(issuedMs) || Math.abs(Date.now() - issuedMs) > DECRYPT_CHALLENGE_MAX_AGE_MS) {
    return { ok: false, error: "authorization challenge has expired; sign a fresh one" };
  }

  let publicKey;
  try {
    publicKey = await verifyPersonalMessageSignature(new TextEncoder().encode(message), signature);
  } catch {
    return { ok: false, error: "invalid signature" };
  }

  if (publicKey.toSuiAddress().toLowerCase() !== viewer.toLowerCase()) {
    return { ok: false, error: "signature does not match the viewer address" };
  }

  return { ok: true };
}

function parseIssued(message: string): string | null {
  const line = message.split("\n").find((l) => l.startsWith("issued: "));
  return line ? line.slice("issued: ".length) : null;
}
