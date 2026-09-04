import { and, count, eq, gt, gte, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createHash, timingSafeEqual } from "node:crypto";
import * as schema from "../schema";
import { DbDomainError } from "../errors";
import { appendAuditEvent } from "./audit";

type Db = PostgresJsDatabase<typeof schema>;

function hashBytes(value: string | Buffer): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, "hex");
  return createHash("sha256").update(value, "utf8").digest();
}

function normalizeAddress(value: string, strict = true): string {
  const address = value.trim().toLowerCase();
  if (strict && !/^0x[0-9a-f]{64}$/.test(address)) {
    throw new DbDomainError("INVALID_SUI_ADDRESS", "address is not canonical");
  }
  return address;
}

async function transactionNow(tx: { execute: Db["execute"] }): Promise<Date> {
  const rows = await tx.execute(sql`select transaction_timestamp() as now`) as unknown as Array<{ now: string | Date }>;
  const value = rows[0]?.now;
  const now = value instanceof Date ? value : new Date(value ?? "");
  if (!Number.isFinite(now.getTime())) {
    throw new DbDomainError("DB_CLOCK_UNAVAILABLE", "database time is unavailable");
  }
  return now;
}

export type CompleteLoginInput = {
  address: string;
  nonceHash: string | Buffer;
  sessionTokenHash: string | Buffer;
  priorSessionHash?: string | Buffer | null;
  sessionTtlSeconds?: number;
};

export class AuthRepository {
  constructor(private readonly db: Db) {}
  async createChallenge(input: { address: string; nonceHash: string | Buffer; domain: string; network?: "testnet"; issuedAt: Date; expiresAt: Date }) {
    const address = normalizeAddress(input.address);
    const network = input.network ?? "testnet";
    const lifetime = input.expiresAt.getTime() - input.issuedAt.getTime();
    if (network !== "testnet" || lifetime <= 0 || lifetime > 5 * 60_000) {
      throw new DbDomainError("INVALID_AUTH_CHALLENGE", "challenge lifetime is invalid");
    }
    const [challenge] = await this.db.insert(schema.authChallenges).values({
      address,
      nonceHash: hashBytes(input.nonceHash),
      domain: input.domain,
      network,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    }).returning();
    if (!challenge) throw new DbDomainError("AUTH_CHALLENGE_CREATE_FAILED", "challenge was not created");
    return challenge;
  }
  async consumeChallenge(nonceHash: string | Buffer, address: string, now: Date) {
    const normalized = normalizeAddress(address, false);
    if (!/^0x[0-9a-f]{64}$/.test(normalized)) return null;
    const [challenge] = await this.db.update(schema.authChallenges).set({ usedAt: now }).where(and(
      eq(schema.authChallenges.nonceHash, hashBytes(nonceHash)),
      eq(schema.authChallenges.address, normalized),
      isNull(schema.authChallenges.usedAt),
      gt(schema.authChallenges.expiresAt, now),
    )).returning();
    return challenge ?? null;
  }
  async findChallenge(nonceHash: string | Buffer, address: string) {
    const normalized = normalizeAddress(address, false);
    if (!/^0x[0-9a-f]{64}$/.test(normalized)) return null;
    const [challenge] = await this.db.select().from(schema.authChallenges).where(and(
      eq(schema.authChallenges.nonceHash, hashBytes(nonceHash)),
      eq(schema.authChallenges.address, normalized),
    )).limit(1);
    return challenge ?? null;
  }

  /**
   * Consume the challenge, upsert the identity, rotate the supplied session,
   * issue its replacement, and write all auth audits in one transaction.
   * A failed later write rolls back the nonce consumption as well.
   */
  async completeLogin(input: CompleteLoginInput) {
    const address = normalizeAddress(input.address);
    const ttl = input.sessionTtlSeconds ?? 43_200;
    if (!Number.isInteger(ttl) || ttl <= 0 || ttl > 43_200) {
      throw new DbDomainError("INVALID_SESSION_TTL", "session lifetime is invalid");
    }
    return this.db.transaction(async (tx) => {
      const now = await transactionNow(tx);
      const [challenge] = await tx.update(schema.authChallenges).set({ usedAt: now }).where(and(
        eq(schema.authChallenges.nonceHash, hashBytes(input.nonceHash)),
        eq(schema.authChallenges.address, address),
        isNull(schema.authChallenges.usedAt),
        gt(schema.authChallenges.expiresAt, now),
      )).returning();
      if (!challenge || challenge.network !== "testnet") {
        throw new DbDomainError("AUTH_CHALLENGE_UNAVAILABLE", "challenge is unavailable");
      }

      const [user] = await tx.insert(schema.users).values({
        primarySuiAddress: address,
        lastLoginAt: now,
      }).onConflictDoUpdate({
        target: schema.users.primarySuiAddress,
        set: { lastLoginAt: now },
      }).returning();
      if (!user) throw new DbDomainError("AUTH_USER_CREATE_FAILED", "user was not created");

      let replacedSession: typeof schema.sessions.$inferSelect | null = null;
      if (input.priorSessionHash) {
        const [old] = await tx.update(schema.sessions).set({ revokedAt: now }).where(and(
          eq(schema.sessions.tokenHash, hashBytes(input.priorSessionHash)),
          isNull(schema.sessions.revokedAt),
        )).returning();
        replacedSession = old ?? null;
      }

      const [session] = await tx.insert(schema.sessions).values({
        userId: user.id,
        tokenHash: hashBytes(input.sessionTokenHash),
        expiresAt: new Date(now.getTime() + ttl * 1000),
        lastSeenAt: now,
      }).returning();
      if (!session) throw new DbDomainError("AUTH_SESSION_CREATE_FAILED", "session was not created");

      if (replacedSession) {
        await appendAuditEvent(tx, {
          organizationId: null,
          actorType: "user",
          actorId: user.id,
          eventType: "auth_session_revoked",
          subjectType: "session",
          subjectId: replacedSession.id,
          metadataJson: { state: "rotated" },
        });
      }
      await appendAuditEvent(tx, {
        organizationId: null,
        actorType: "user",
        actorId: user.id,
        eventType: "auth_login_succeeded",
        subjectType: "user",
        subjectId: user.id,
        metadataJson: { state: "authenticated" },
      });
      return { challenge, user, session, replacedSession, now };
    });
  }

  async recordAuthFailure(category: "invalid_request" | "challenge_unavailable" | "signature_invalid" | "origin_denied" | "configuration_error" | "internal_error") {
    await appendAuditEvent(this.db, {
      organizationId: null,
      actorType: "anonymous",
      actorId: null,
      eventType: "auth_login_failed",
      subjectType: "auth",
      subjectId: "anonymous",
      metadataJson: { state: category },
    });
  }

  async createSession(input: { userId: string; tokenHash: string | Buffer; expiresAt: Date; now: Date }) {
    const [session] = await this.db.insert(schema.sessions).values({ userId: input.userId, tokenHash: hashBytes(input.tokenHash), expiresAt: input.expiresAt, lastSeenAt: input.now }).returning();
    return session!;
  }
  async upsertUser(address: string, now: Date) {
    const [user] = await this.db.insert(schema.users).values({ primarySuiAddress: normalizeAddress(address), lastLoginAt: now }).onConflictDoUpdate({ target: schema.users.primarySuiAddress, set: { lastLoginAt: now } }).returning();
    return user!;
  }
  async revokeSession(tokenHash: string | Buffer, now: Date) {
    const [session] = await this.db.update(schema.sessions).set({ revokedAt: now }).where(and(eq(schema.sessions.tokenHash, hashBytes(tokenHash)), isNull(schema.sessions.revokedAt))).returning();
    return session ?? null;
  }
  async activeSession(tokenHash: string | Buffer, now: Date) {
    const [row] = await this.db.select({ session: schema.sessions, user: schema.users }).from(schema.sessions).innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id)).where(and(eq(schema.sessions.tokenHash, hashBytes(tokenHash)), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, now))).limit(1);
    return row ?? null;
  }

  async authorizeAgent(input: { tokenPrefix: string; tokenHash: string | Buffer; requestsPerMinute?: number }) {
    const limit = input.requestsPerMinute ?? 60;
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new DbDomainError("INVALID_RATE_LIMIT", "credential rate limit is invalid");
    return this.db.transaction(async (tx) => {
      const [clock] = await tx.execute(sql`select transaction_timestamp() as now`) as unknown as [{ now: string | Date }];
      if (!clock?.now) throw new DbDomainError("DB_CLOCK_UNAVAILABLE", "database time is unavailable");
      const now = new Date(clock.now);
      const [row] = await tx.select({ credential: schema.agentCredentials, assignment: schema.assignments, agent: schema.agents, wallet: schema.wallets, organization: schema.organizations })
        .from(schema.agentCredentials)
        .innerJoin(schema.assignments, and(eq(schema.assignments.id, schema.agentCredentials.assignmentId), eq(schema.assignments.organizationId, schema.agentCredentials.organizationId)))
        .innerJoin(schema.agents, and(eq(schema.agents.id, schema.assignments.agentId), eq(schema.agents.organizationId, schema.agentCredentials.organizationId)))
        .innerJoin(schema.wallets, and(eq(schema.wallets.id, schema.assignments.walletId), eq(schema.wallets.organizationId, schema.agentCredentials.organizationId)))
        .innerJoin(schema.organizations, eq(schema.organizations.id, schema.agentCredentials.organizationId))
        .where(eq(schema.agentCredentials.tokenPrefix, input.tokenPrefix)).for("update").limit(1);
      const supplied = hashBytes(input.tokenHash);
      const expected = row?.credential.tokenHash ?? Buffer.alloc(32);
      const digestValid = expected.length === supplied.length && timingSafeEqual(expected, supplied);
      if (!row || !digestValid) throw new DbDomainError("AGENT_UNAUTHENTICATED", "agent credential is invalid");
      if (row.credential.revokedAt || (row.credential.expiresAt && row.credential.expiresAt <= now) || row.assignment.status !== "active" || row.agent.status !== "active" || row.wallet.executionStatus !== "enabled" || row.wallet.archivedAt || row.organization.status !== "active") throw new DbDomainError("AGENT_UNAUTHENTICATED", "agent credential is invalid");
      const windowStart = new Date(now);
      windowStart.setUTCSeconds(0, 0);
      const [usage] = await tx.select({ value: count() }).from(schema.auditEvents).where(and(eq(schema.auditEvents.actorType, "credential"), eq(schema.auditEvents.actorId, row.credential.id), eq(schema.auditEvents.eventType, "credential_request"), gte(schema.auditEvents.createdAt, windowStart)));
      if ((usage?.value ?? 0) >= limit) throw new DbDomainError("RATE_LIMITED", "credential request limit exceeded");
      await appendAuditEvent(tx, { organizationId: row.organization.id, actorType: "credential", actorId: row.credential.id, eventType: "credential_request", subjectType: "assignment", subjectId: row.assignment.id, metadataJson: { assignmentId: row.assignment.id, state: "accepted" } });
      return { ...row, now };
    });
  }

  async touchCredential(credentialId: string, now = new Date()) {
    await this.db.update(schema.agentCredentials).set({ lastUsedAt: now }).where(eq(schema.agentCredentials.id, credentialId));
  }
}
