import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { DbDomainError } from "../src/errors";
import { PolicyRepository } from "../src/repositories/policies";
import { AuditRepository } from "../src/repositories/audit";
import { auditEvents, policyRecipientRules, policyScopes, policyVersions } from "../src/schema";
import { cleanupFixture, createFixture, databaseUrl, hexHash, openDb } from "./support";

const test = databaseUrl ? it : it.skip;
const connections: ReturnType<typeof openDb>[] = [];

afterAll(async () => Promise.all(connections.map(({ client }) => client.end())));

describe("PolicyRepository and immutable audit rows", () => {
  test("activates one current version when two workers race", async () => {
    const value = openDb();
    connections.push(value);
    const fixture = await createFixture(value.db);
    const repository = new PolicyRepository(value.db);
    const scope = await repository.createScope({ organizationId: fixture.organizationId, actorId: fixture.userId, scopeType: "wallet", walletId: fixture.walletId });
    const base = { organizationId: fixture.organizationId, scopeId: scope.id, createdByUserId: fixture.userId, maxPerTxMist: 1n, maxPerDayMist: 2n, maxPerMonthMist: 3n, blockRiskScoreAt: 90, requireSimulation: true as const };
    const first = await repository.createDraft({ ...base, version: 1 });
    const second = await repository.createDraft({ ...base, version: 2, blockRiskScoreAt: 89 });
    await Promise.all([
      repository.activate({ scopeId: scope.id, versionId: first.id, organizationId: fixture.organizationId, actorId: fixture.userId }),
      repository.activate({ scopeId: scope.id, versionId: second.id, organizationId: fixture.organizationId, actorId: fixture.userId }),
    ]);
    const active = await value.db.select().from(policyVersions).where(and(eq(policyVersions.scopeId, scope.id), eq(policyVersions.status, "active")));
    expect(active).toHaveLength(1);
    await cleanupFixture(value.db, fixture);
  });

  test("rejects active policy and active recipient-rule mutation", async () => {
    const value = openDb();
    connections.push(value);
    const fixture = await createFixture(value.db);
    const repository = new PolicyRepository(value.db);
    const scope = await repository.createScope({ organizationId: fixture.organizationId, actorId: fixture.userId, scopeType: "wallet", walletId: fixture.walletId });
    const draft = await repository.createDraft({ organizationId: fixture.organizationId, scopeId: scope.id, version: 1, createdByUserId: fixture.userId, maxPerTxMist: 1n, maxPerDayMist: 2n, maxPerMonthMist: 3n, blockRiskScoreAt: 90, requireSimulation: true });
    const active = await repository.activate({ scopeId: scope.id, versionId: draft.id, organizationId: fixture.organizationId, actorId: fixture.userId });
    await expect(value.db.update(policyVersions).set({ maxPerTxMist: "2" }).where(eq(policyVersions.id, active.id))).rejects.toMatchObject({ cause: { code: "55000" } });
    await expect(value.db.insert(policyRecipientRules).values({ policyVersionId: active.id, recipient: `0x${"3".padStart(64, "0")}`, effect: "allow" })).rejects.toMatchObject({ cause: { code: "55000" } });
    await cleanupFixture(value.db, fixture);
  });

  test("keeps audit rows append-only", async () => {
    const value = openDb();
    connections.push(value);
    const fixture = await createFixture(value.db);
    const [event] = await value.db.insert(auditEvents).values({ organizationId: fixture.organizationId, actorType: "test", eventType: "test_event", subjectType: "fixture", subjectId: fixture.organizationId, metadataJson: { state: "created" } }).returning();
    await expect(value.db.update(auditEvents).set({ eventType: "changed" }).where(eq(auditEvents.id, event!.id))).rejects.toMatchObject({ cause: { code: "55000" } });
    await expect(value.db.delete(auditEvents).where(eq(auditEvents.id, event!.id))).rejects.toMatchObject({ cause: { code: "55000" } });
    await cleanupFixture(value.db, fixture);
  });

  test("requires an administrator and rejects recipient-rule drift before activation", async () => {
    const value = openDb();
    connections.push(value);
    const fixture = await createFixture(value.db);
    const other = await createFixture(value.db);
    const repository = new PolicyRepository(value.db);
    await expect(repository.createScope({ organizationId: fixture.organizationId, actorId: crypto.randomUUID(), scopeType: "wallet", walletId: fixture.walletId })).rejects.toMatchObject({ code: "POLICY_SCOPE_CREATOR_UNAUTHORIZED" });
    await expect(repository.createScope({ organizationId: fixture.organizationId, actorId: fixture.userId, scopeType: "wallet", walletId: other.walletId })).rejects.toMatchObject({ code: "POLICY_SCOPE_SUBJECT_NOT_FOUND" });
    const scope = await repository.createScope({ organizationId: fixture.organizationId, actorId: fixture.userId, scopeType: "wallet", walletId: fixture.walletId });
    const draft = await repository.createDraft({ organizationId: fixture.organizationId, scopeId: scope.id, version: 1, createdByUserId: fixture.userId, maxPerTxMist: 1n, maxPerDayMist: 2n, maxPerMonthMist: 3n, blockRiskScoreAt: 90, requireSimulation: true, rules: [{ recipient: `0x${"3".repeat(64)}`, effect: "allow" }] });
    await value.db.insert(policyRecipientRules).values({ policyVersionId: draft.id, recipient: `0x${"4".repeat(64)}`, effect: "allow" });
    await expect(repository.activate({ scopeId: scope.id, versionId: draft.id, organizationId: fixture.organizationId, actorId: fixture.userId })).rejects.toMatchObject({ code: "POLICY_DOCUMENT_MISMATCH" });
    await expect(repository.activate({ scopeId: scope.id, versionId: draft.id, organizationId: fixture.organizationId, actorId: crypto.randomUUID() })).rejects.toMatchObject({ code: "POLICY_ACTIVATOR_UNAUTHORIZED" });
    await cleanupFixture(value.db, fixture);
    await cleanupFixture(value.db, other);
  });

  test("rejects secret-bearing audit metadata", async () => {
    const value = openDb();
    connections.push(value);
    const fixture = await createFixture(value.db);
    const audit = new AuditRepository(value.db);
    await expect(audit.append({ organizationId: fixture.organizationId, actorType: "test", eventType: "test_event", subjectType: "fixture", subjectId: fixture.organizationId, metadataJson: { token: "secret" } })).rejects.toMatchObject({ code: "AUDIT_METADATA_REJECTED" });
    await expect(value.db.insert(auditEvents).values({ organizationId: fixture.organizationId, actorType: "test", eventType: "test_event", subjectType: "fixture", subjectId: fixture.organizationId, metadataJson: { token: "secret" } })).rejects.toMatchObject({ cause: { code: "22023" } });
    await expect(audit.append({ organizationId: fixture.organizationId, actorType: "test", eventType: "test_event", subjectType: "fixture", subjectId: fixture.organizationId, metadataJson: { state: { token: "secret" } } as never })).rejects.toMatchObject({ code: "AUDIT_METADATA_REJECTED" });
    await expect(value.db.insert(auditEvents).values({ organizationId: fixture.organizationId, actorType: "test", eventType: "test_event", subjectType: "fixture", subjectId: fixture.organizationId, metadataJson: { state: { token: "secret" } } })).rejects.toMatchObject({ cause: { code: "22023" } });
    await cleanupFixture(value.db, fixture);
  });
});
