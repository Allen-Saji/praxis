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
  async findChallenge(nonceHash: string, address: string) {
    const [challenge] = await this.db.select().from(schema.authChallenges).where(and(eq(schema.authChallenges.nonceHash, nonceHash), eq(schema.authChallenges.address, address))).limit(1);
    return challenge ?? null;
  }
  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date; now: Date }) {
    const [session] = await this.db.insert(schema.sessions).values({ ...input, lastSeenAt: input.now }).returning();
    return session!;
  }
  async upsertUser(address: string, now: Date) {
    const [user] = await this.db.insert(schema.users).values({ primarySuiAddress: address, lastLoginAt: now }).onConflictDoUpdate({ target: schema.users.primarySuiAddress, set: { lastLoginAt: now } }).returning();
    return user!;
  }
  async revokeSession(tokenHash: string, now: Date) {
    const [session] = await this.db.update(schema.sessions).set({ revokedAt: now }).where(and(eq(schema.sessions.tokenHash, tokenHash), isNull(schema.sessions.revokedAt))).returning();
    return session ?? null;
  }
  async activeSession(tokenHash: string, now: Date) {
    const [row] = await this.db.select({ session: schema.sessions, user: schema.users }).from(schema.sessions).innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id)).where(and(eq(schema.sessions.tokenHash, tokenHash), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, now))).limit(1);
    return row ?? null;
  }
}
