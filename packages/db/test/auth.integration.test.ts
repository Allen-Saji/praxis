import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { AuthRepository } from "../src/repositories/auth";
import { agentCredentials, sessions, users } from "../src/schema";
import { createFixture, databaseUrl, openDb } from "./support";

const test = databaseUrl ? it : it.skip;
const connections: ReturnType<typeof openDb>[] = [];

afterAll(async () => {
  await Promise.all(connections.map(({ client }) => client.end()));
});

function connection() {
  const value = openDb();
  connections.push(value);
  return value;
}

describe("AuthRepository", () => {
  test("consumes each unexpired challenge exactly once under concurrency", async () => {
    const first = connection();
    const second = connection();
    const firstRepo = new AuthRepository(first.db);
    const secondRepo = new AuthRepository(second.db);
    const now = new Date();
    const nonceHash = `nonce-${crypto.randomUUID()}`;
    const address = `0x${crypto.randomUUID().replaceAll("-", "").padEnd(64, "0")}`;
    await firstRepo.createChallenge({ address, nonceHash, domain: "praxis.test", issuedAt: now, expiresAt: new Date(now.getTime() + 60_000) });

    const results = await Promise.all([
      firstRepo.consumeChallenge(nonceHash, address, now),
      secondRepo.consumeChallenge(nonceHash, address, now),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((value) => value === null)).toHaveLength(1);
  });

  test("rejects wrong address, expired, and already-used challenges", async () => {
    const value = connection();
    const repo = new AuthRepository(value.db);
    const now = new Date();
    const nonceHash = `nonce-${crypto.randomUUID()}`;
    const address = `0x${crypto.randomUUID().replaceAll("-", "").padEnd(64, "0")}`;
    await repo.createChallenge({ address, nonceHash, domain: "praxis.test", issuedAt: now, expiresAt: new Date(now.getTime() + 60_000) });
    expect(await repo.consumeChallenge(nonceHash, "0xwrong", now)).toBeNull();
    expect(await repo.consumeChallenge(nonceHash, address, new Date(now.getTime() + 60_001))).toBeNull();
    expect(await repo.consumeChallenge(nonceHash, address, now)).not.toBeNull();
    expect(await repo.consumeChallenge(nonceHash, address, now)).toBeNull();
  });

  test("upserts one user and enforces session expiry and revocation", async () => {
    const value = connection();
    const repo = new AuthRepository(value.db);
    const now = new Date();
    const address = `0x${crypto.randomUUID().replaceAll("-", "").padEnd(64, "0")}`;
    const user = await repo.upsertUser(address, now);
    const sameUser = await repo.upsertUser(address, new Date(now.getTime() + 1_000));
    expect(sameUser.id).toBe(user.id);

    const active = await repo.createSession({ userId: user.id, tokenHash: `token-${crypto.randomUUID()}`, expiresAt: new Date(now.getTime() + 60_000), now });
    expect((await repo.activeSession(active.tokenHash, now))?.user.id).toBe(user.id);
    expect(await repo.activeSession(active.tokenHash, new Date(now.getTime() + 60_001))).toBeNull();

    const revoked = await repo.revokeSession(active.tokenHash, new Date(now.getTime() + 2_000));
    expect(revoked?.id).toBe(active.id);
    expect(await repo.activeSession(active.tokenHash, new Date(now.getTime() + 2_001))).toBeNull();
    expect(await repo.revokeSession(active.tokenHash, now)).toBeNull();

    await value.db.delete(sessions).where(eq(sessions.userId, user.id));
    await value.db.delete(users).where(eq(users.id, user.id));
  });

  test("authenticates a credential with active parents and enforces a shared rate limit", async () => {
    const value = connection();
    const fixture = await createFixture(value.db, crypto.randomUUID().slice(0, 8));
    const [credential] = await value.db.select().from(agentCredentials).where(eq(agentCredentials.id, fixture.credentialId));
    if (!credential) throw new Error("credential fixture missing");
    const repository = new AuthRepository(value.db);
    const authorized = await repository.authorizeAgent({ tokenPrefix: credential.tokenPrefix, tokenHash: credential.tokenHash, requestsPerMinute: 1 });
    expect(authorized.assignment.id).toBe(fixture.assignmentId);
    expect(authorized.wallet.id).toBe(fixture.walletId);
    await expect(repository.authorizeAgent({ tokenPrefix: credential.tokenPrefix, tokenHash: credential.tokenHash, requestsPerMinute: 1 })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(repository.authorizeAgent({ tokenPrefix: credential.tokenPrefix, tokenHash: Buffer.alloc(32), requestsPerMinute: 2 })).rejects.toMatchObject({ code: "AGENT_UNAUTHENTICATED" });
  });
});
