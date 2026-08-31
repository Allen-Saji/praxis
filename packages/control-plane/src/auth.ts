import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DomainError } from "./index";

const TOKEN_RE = /^px_agent_([A-Za-z0-9_-]{12})_([A-Za-z0-9_-]{43})$/;

export function createAgentCredential(): { token: string; prefix: string } {
  const prefix = randomBytes(9).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  return { token: `px_agent_${prefix}_${secret}`, prefix };
}

export function parseAgentCredential(token: string): { prefix: string } {
  const match = TOKEN_RE.exec(token);
  if (!match) throw new DomainError("INVALID_CREDENTIAL", "credential is malformed");
  return { prefix: match[1]! };
}

export function tokenDigest(token: string, pepper: string): string {
  if (!pepper) throw new DomainError("CONFIGURATION_ERROR", "credential pepper is required");
  return createHmac("sha256", pepper).update(token).digest("hex");
}

export function digestMatches(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, "hex"); const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSessionToken(): string { return randomBytes(32).toString("base64url"); }
export function challengeMessage(input: { domain: string; uri: string; address: string; nonce: string; issuedAt: Date; expiresAt: Date }): string {
  return `Praxis control plane login\ndomain: ${input.domain}\nuri: ${input.uri}\naddress: ${input.address}\nnetwork: testnet\nnonce: ${input.nonce}\nissued-at: ${input.issuedAt.toISOString()}\nexpiration-time: ${input.expiresAt.toISOString()}\nstatement: Sign in to manage Praxis policies and agent credentials. This does not authorize a transaction.`;
}
