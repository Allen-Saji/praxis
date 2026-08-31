import { describe, expect, it } from "vitest";
import { AuthRepository, createDb } from "../src";
const url = process.env.DATABASE_URL; const test = url ? it : it.skip;
describe("AuthRepository", () => {
  test("consumes each unexpired challenge exactly once", async () => {
    const { db } = createDb(url!); const repo = new AuthRepository(db); const now = new Date(); const nonce = crypto.randomUUID();
    await repo.createChallenge({ address: "0x1", nonceHash: nonce, domain: "praxis.test", issuedAt: now, expiresAt: new Date(now.getTime() + 60_000) });
    expect(await repo.consumeChallenge(nonce, "0x1", now)).not.toBeNull();
    expect(await repo.consumeChallenge(nonce, "0x1", now)).toBeNull();
  });
});
