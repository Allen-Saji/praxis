import { describe, expect, it } from "vitest";
import { challengeMessage, createAgentCredential, createSessionToken, digestMatches, parseAgentCredential, tokenDigest } from "../src";
describe("auth primitives", () => {
  it("creates parseable scoped credentials and verifies HMAC digests", () => { const credential = createAgentCredential(); expect(parseAgentCredential(credential.token).prefix).toBe(credential.prefix); const digest = tokenDigest(credential.token, "pepper"); expect(digestMatches(digest, tokenDigest(credential.token, "pepper"))).toBe(true); expect(digestMatches(digest, tokenDigest(credential.token, "other"))).toBe(false); });
  it("uses opaque session tokens and exact login messages", () => { expect(createSessionToken()).toHaveLength(43); expect(challengeMessage({ domain: "praxis.test", uri: "https://praxis.test", address: "0x1", nonce: "n", issuedAt: new Date("2026-01-01T00:00:00Z"), expiresAt: new Date("2026-01-01T00:05:00Z") })).toContain("This does not authorize a transaction."); });
});
