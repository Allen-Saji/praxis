import { and, eq, gt, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";

export class AuthRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}
  async createChallenge(input: { address: string; nonceHash: string; domain: string; issuedAt: Date; expiresAt: Date }) {
    const [challenge] = await this.db.insert(schema.authChallenges).values(input).returning();
    return challenge!;
  }
  async consumeChallenge(nonceHash: string, address: string, now: Date) {
    const [challenge] = await this.db.update(schema.authChallenges).set({ usedAt: now }).where(and(eq(schema.authChallenges.nonceHash, nonceHash), eq(schema.authChallenges.address, address), isNull(schema.authChallenges.usedAt), gt(schema.authChallenges.expiresAt, now))).returning();
    return challenge ?? null;
  }
  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date; now: Date }) {
    const [session] = await this.db.insert(schema.sessions).values({ ...input, lastSeenAt: input.now }).returning();
    return session!;
  }
  async revokeSession(tokenHash: string, now: Date) {
    const [session] = await this.db.update(schema.sessions).set({ revokedAt: now }).where(and(eq(schema.sessions.tokenHash, tokenHash), isNull(schema.sessions.revokedAt))).returning();
    return session ?? null;
  }
}
