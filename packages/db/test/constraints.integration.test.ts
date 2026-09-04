import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { assignments, organizations, policyScopes, policyVersions, spendIntents, wallets } from "../src/schema";
import { cleanupFixture, createActivePolicies, createFixture, databaseUrl, hexHash, openDb } from "./support";

const test = databaseUrl ? it : it.skip;
const connections: ReturnType<typeof openDb>[] = [];

async function expectPostgresCode(operation: Promise<unknown>, expected: string | readonly string[]) {
  try {
    await operation;
  } catch (error) {
    const actual = error as { code?: string; cause?: { code?: string } };
    const codes = Array.isArray(expected) ? expected : [expected];
    expect(codes).toContain(actual.code ?? actual.cause?.code);
    return;
  }
  throw new Error(`expected PostgreSQL error ${expected}`);
}

afterAll(async () => {
  await Promise.all(connections.map(({ client }) => client.end()));
});

function connection() {
  const value = openDb();
  connections.push(value);
  return value;
}

describe("PostgreSQL constraints", () => {
  test("enforces organization slug format and uniqueness", async () => {
    const value = connection();
    const slug = `constraint-${crypto.randomUUID().slice(0, 8)}`;
    const [organization] = await value.db.insert(organizations).values({ slug, name: "Constraint test" }).returning();
    expect(organization).toBeDefined();
    await expectPostgresCode(value.db.insert(organizations).values({ slug, name: "Duplicate" }), "23505");
    await expectPostgresCode(value.db.insert(organizations).values({ slug: "INVALID SLUG", name: "Invalid" }), "23514");
    await value.db.delete(organizations).where(eq(organizations.id, organization!.id));
  });

  test("allows at most one enabled wallet per organization", async () => {
    const value = connection();
    const fixture = await createFixture(value.db);
    const [second] = await value.db.insert(wallets).values({
      organizationId: fixture.organizationId,
      label: "Second wallet",
      suiAddress: `0x${crypto.randomUUID().replaceAll("-", "").padEnd(64, "3")}`,
      adapterRef: "env:TEST-SECOND",
    }).returning();
    await value.db.update(wallets).set({ executionStatus: "enabled" }).where(eq(wallets.id, fixture.walletId));
    await expectPostgresCode(value.db.update(wallets).set({ executionStatus: "enabled" }).where(eq(wallets.id, second!.id)), "23505");
    await value.db.delete(wallets).where(eq(wallets.id, second!.id));
    await cleanupFixture(value.db, fixture);
  });

  test("enforces policy and intent money boundaries", async () => {
    const value = connection();
    const fixture = await createFixture(value.db);
    const [scope] = await value.db.insert(policyScopes).values({ organizationId: fixture.organizationId, scopeType: "wallet", walletId: fixture.walletId }).returning();
    await expectPostgresCode(value.db.insert(policyVersions).values({
      scopeId: scope!.id,
      version: 1,
      maxPerTxMist: 0n,
      maxPerDayMist: 0n,
      maxPerMonthMist: 0n,
      blockRiskScoreAt: 101,
      canonicalJson: {},
      policyHash: "invalid-policy",
      createdByUserId: fixture.userId,
    }), "23514");

    const common = {
      organizationId: fixture.organizationId,
      assignmentId: fixture.assignmentId,
      walletId: fixture.walletId,
      agentId: fixture.agentId,
      idempotencyKey: `constraint-${crypto.randomUUID()}`,
      requestHash: hexHash(`hash-${crypto.randomUUID()}`),
      purposeTag: hexHash(`purpose-${crypto.randomUUID()}`),
      recipient: `0x${"3".padStart(64, "0")}`,
      coinType: "0x2::sui::SUI",
      reasoningJson: {},
      credentialId: fixture.credentialId,
      state: "received" as const,
    };
    await expectPostgresCode(value.db.insert(spendIntents).values({ ...common, amountMist: 0n }), "23514");
    await expectPostgresCode(value.db.insert(spendIntents).values({ ...common, amountMist: 18446744073709551616n, idempotencyKey: `${common.idempotencyKey}-max`, purposeTag: `${common.purposeTag}-max` }), ["23514", "22003"]);
    await expectPostgresCode(value.db.insert(spendIntents).values({ ...common, amountMist: 1n, coinType: "0x2::sui::USDC", idempotencyKey: `${common.idempotencyKey}-coin`, purposeTag: `${common.purposeTag}-coin` }), "23514");
    await expectPostgresCode(value.db.insert(spendIntents).values({ ...common, amountMist: 1n, reasoningJson: { prompt: "p", unsupported: true }, idempotencyKey: `${common.idempotencyKey}-reasoning`, purposeTag: `${common.purposeTag}-reasoning` }), "23514");
    await cleanupFixture(value.db, fixture);
  });

  test("does not permit an invalid policy scope subject", async () => {
    const value = connection();
    const fixture = await createFixture(value.db);
    await expectPostgresCode(value.db.insert(policyScopes).values({ organizationId: fixture.organizationId, scopeType: "wallet", assignmentId: fixture.assignmentId }), "23514");
    await cleanupFixture(value.db, fixture);
  });

  test("rejects cross-tenant assignment enrollment", async () => {
    const value = connection();
    const first = await createFixture(value.db, crypto.randomUUID().slice(0, 8));
    const second = await createFixture(value.db, crypto.randomUUID().slice(0, 8));
    await expectPostgresCode(value.db.insert(assignments).values({
      organizationId: first.organizationId,
      walletId: second.walletId,
      agentId: first.agentId,
    }), "23503");
    await cleanupFixture(value.db, first);
    await cleanupFixture(value.db, second);
  });

  test("rejects cross-tenant policy snapshots on intents", async () => {
    const value = connection();
    const first = await createFixture(value.db, crypto.randomUUID().slice(0, 8));
    const second = await createFixture(value.db, crypto.randomUUID().slice(0, 8));
    const firstPolicies = await createActivePolicies(value.db, first);
    const secondPolicies = await createActivePolicies(value.db, second);
    await expectPostgresCode(value.db.insert(spendIntents).values({
      organizationId: first.organizationId,
      assignmentId: first.assignmentId,
      walletId: first.walletId,
      agentId: first.agentId,
      credentialId: first.credentialId,
      idempotencyKey: `tenant-policy-${crypto.randomUUID()}`,
      requestHash: hexHash("tenant-policy-request"),
      purposeTag: hexHash("tenant-policy-purpose"),
      recipient: `0x${"3".repeat(64)}`,
      amountMist: 1n,
      coinType: "0x2::sui::SUI",
      reasoningJson: {},
      state: "reserved",
      stateVersion: 1,
      walletPolicyVersionId: secondPolicies.walletPolicy.id,
      walletPolicyHash: secondPolicies.walletPolicy.policyHash,
      assignmentPolicyVersionId: firstPolicies.assignmentPolicy.id,
      assignmentPolicyHash: firstPolicies.assignmentPolicy.policyHash,
      effectivePolicyHash: hexHash("tenant-policy-effective"),
      policySnapshotJson: { wallet: secondPolicies.walletPolicy.policyHash, assignment: firstPolicies.assignmentPolicy.policyHash },
    }), "23514");
    await cleanupFixture(value.db, first);
    await cleanupFixture(value.db, second);
  });
});
