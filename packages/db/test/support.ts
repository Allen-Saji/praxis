import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createDb } from "../src/client";
import * as schema from "../src/schema";
import { PolicyRepository } from "../src/repositories/policies";

export const databaseUrl = process.env.DATABASE_URL;

export function hexHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function openDb() {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
  return createDb(databaseUrl);
}

export type TestDb = ReturnType<typeof openDb>;

export type Fixture = {
  organizationId: string;
  userId: string;
  walletId: string;
  agentId: string;
  assignmentId: string;
  credentialId: string;
};

export async function createFixture(db: PostgresJsDatabase<typeof schema>, suffix = crypto.randomUUID().slice(0, 8)): Promise<Fixture> {
  const [organization] = await db.insert(schema.organizations).values({ slug: `test-${suffix}`, name: "Integration test organization" }).returning();
  if (!organization) throw new Error("organization fixture was not created");

  const [user] = await db.insert(schema.users).values({ primarySuiAddress: address("1", suffix) }).returning();
  if (!user) throw new Error("user fixture was not created");
  await db.insert(schema.organizationMembers).values({ organizationId: organization.id, userId: user.id, role: "owner" });

  const [wallet] = await db.insert(schema.wallets).values({
    organizationId: organization.id,
    label: "Integration test wallet",
    suiAddress: address("2", suffix),
    adapterRef: "env:TEST",
    executionStatus: "enabled",
  }).returning();
  if (!wallet) throw new Error("wallet fixture was not created");

  const [agent] = await db.insert(schema.agents).values({
    organizationId: organization.id,
    name: "Integration test agent",
    externalRef: `agent-${suffix}`,
  }).returning();
  if (!agent) throw new Error("agent fixture was not created");

  const [assignment] = await db.insert(schema.assignments).values({
    organizationId: organization.id,
    walletId: wallet.id,
    agentId: agent.id,
  }).returning();
  if (!assignment) throw new Error("assignment fixture was not created");

  const [credential] = await db.insert(schema.agentCredentials).values({
    organizationId: organization.id,
    assignmentId: assignment.id,
    name: "Integration test credential",
    tokenPrefix: `px_test_${suffix}`,
    tokenHash: createHash("sha256").update(suffix).digest(),
    createdByUserId: user.id,
  }).returning();
  if (!credential) throw new Error("credential fixture was not created");

  return {
    organizationId: organization.id,
    userId: user.id,
    walletId: wallet.id,
    agentId: agent.id,
    assignmentId: assignment.id,
    credentialId: credential.id,
  };
}

export async function createActivePolicies(db: PostgresJsDatabase<typeof schema>, fixture: Fixture, limits: { maxPerTxMist?: bigint; maxPerDayMist?: bigint; maxPerMonthMist?: bigint } = {}) {
  const repository = new PolicyRepository(db);
  const walletScope = await repository.createScope({ organizationId: fixture.organizationId, actorId: fixture.userId, scopeType: "wallet", walletId: fixture.walletId });
  const assignmentScope = await repository.createScope({ organizationId: fixture.organizationId, actorId: fixture.userId, scopeType: "assignment", assignmentId: fixture.assignmentId });
  const policy = {
    version: 1,
    createdByUserId: fixture.userId,
    maxPerTxMist: limits.maxPerTxMist ?? 10n,
    maxPerDayMist: limits.maxPerDayMist ?? 10n,
    maxPerMonthMist: limits.maxPerMonthMist ?? 10n,
    blockRiskScoreAt: 90,
    requireSimulation: true as const,
  };
  const walletPolicy = await repository.createDraft({ ...policy, organizationId: fixture.organizationId, scopeId: walletScope.id });
  const assignmentPolicy = await repository.createDraft({ ...policy, organizationId: fixture.organizationId, scopeId: assignmentScope.id });
  const actorId = fixture.userId;
  await repository.activate({ scopeId: walletScope.id, versionId: walletPolicy.id, organizationId: fixture.organizationId, actorId });
  await repository.activate({ scopeId: assignmentScope.id, versionId: assignmentPolicy.id, organizationId: fixture.organizationId, actorId });
  return { walletPolicy, assignmentPolicy };
}

export async function cleanupFixture(db: PostgresJsDatabase<typeof schema>, fixture: Fixture) {
  // Audit rows are append-only by design. The disposable test database keeps
  // them so cleanup never needs to bypass the production immutability trigger.
  await db.delete(schema.budgetReservations).where(eq(schema.budgetReservations.assignmentId, fixture.assignmentId));
  await db.delete(schema.assignmentBudgetCounters).where(eq(schema.assignmentBudgetCounters.assignmentId, fixture.assignmentId));
  await db.delete(schema.walletBudgetCounters).where(eq(schema.walletBudgetCounters.walletId, fixture.walletId));
  await db.delete(schema.walletExecutionLeases).where(eq(schema.walletExecutionLeases.organizationId, fixture.organizationId));
  await db.delete(schema.spendIntents).where(eq(schema.spendIntents.organizationId, fixture.organizationId));
  await db.delete(schema.agentCredentials).where(eq(schema.agentCredentials.organizationId, fixture.organizationId));
  const [immutablePolicy] = await db.select({ id: schema.policyVersions.id }).from(schema.policyVersions)
    .innerJoin(schema.policyScopes, eq(schema.policyScopes.id, schema.policyVersions.scopeId))
    .innerJoin(schema.policyRecipientRules, eq(schema.policyRecipientRules.policyVersionId, schema.policyVersions.id))
    .where(and(eq(schema.policyScopes.organizationId, fixture.organizationId), inArray(schema.policyVersions.status, ["active", "superseded"]))).limit(1);
  // Active and superseded policy content is intentionally immutable. Leave
  // this isolated fixture graph in place instead of bypassing its triggers.
  if (immutablePolicy) return;
  await db.delete(schema.policyRecipientRules).where(inArray(schema.policyRecipientRules.policyVersionId,
    db.select({ id: schema.policyVersions.id }).from(schema.policyVersions).innerJoin(schema.policyScopes, eq(schema.policyVersions.scopeId, schema.policyScopes.id)).where(eq(schema.policyScopes.organizationId, fixture.organizationId)),
  ));
  await db.update(schema.policyScopes).set({ currentVersionId: null }).where(eq(schema.policyScopes.organizationId, fixture.organizationId));
  await db.delete(schema.policyVersions).where(inArray(schema.policyVersions.scopeId,
    db.select({ id: schema.policyScopes.id }).from(schema.policyScopes).where(eq(schema.policyScopes.organizationId, fixture.organizationId)),
  ));
  await db.delete(schema.policyScopes).where(eq(schema.policyScopes.organizationId, fixture.organizationId));
  await db.delete(schema.assignments).where(eq(schema.assignments.id, fixture.assignmentId));
  await db.delete(schema.agents).where(eq(schema.agents.id, fixture.agentId));
  await db.delete(schema.wallets).where(eq(schema.wallets.id, fixture.walletId));
  await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.organizationId, fixture.organizationId));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, fixture.userId));
  await db.delete(schema.users).where(eq(schema.users.id, fixture.userId));
}

export function address(prefix: string, suffix = crypto.randomUUID().replaceAll("-", "")) {
  return `0x${prefix}${suffix.replaceAll("-", "").padEnd(63, "0").slice(0, 63)}`;
}

export function adminUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/postgres";
  parsed.search = "";
  return parsed.toString();
}

export function identifier(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("invalid test database identifier");
  return `"${value}"`;
}

export function openAdmin(url: string) {
  return postgres(adminUrl(url), { max: 1, prepare: false });
}
