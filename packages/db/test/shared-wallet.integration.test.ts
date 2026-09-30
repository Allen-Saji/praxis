import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { WorkspaceRepository } from "../src/repositories/workspaces";
import { SpendingPreviewRepository } from "../src/repositories/previews";
import { PolicyRepository } from "../src/repositories/policies";
import { IntentRepository } from "../src/repositories/intents";
import { ReservationRepository } from "../src/repositories/reservations";
import * as schema from "../src/schema";
import { address, createActivePolicies, createFixture, databaseUrl, hexHash, openDb, type Fixture } from "./support";

const test = databaseUrl ? it : it.skip;
const opened: ReturnType<typeof openDb>[] = [];
function connection() { const value = openDb(); opened.push(value); return value; }
afterAll(async () => { await Promise.all(opened.map(({ client }) => client.end())); });

async function setup(walletLimit = 10n) {
  const { db } = connection();
  const a = await createFixture(db);
  await createActivePolicies(db, a, { maxPerTxMist: walletLimit, maxPerDayMist: walletLimit, maxPerMonthMist: walletLimit });
  const workspaces = new WorkspaceRepository(db);
  const policies = new PolicyRepository(db);
  async function add(name: string) {
    const agent = await workspaces.createAgent({ organizationId: a.organizationId, actorId: a.userId, name, externalRef: crypto.randomUUID() });
    const access = await workspaces.createAssignment({ organizationId: a.organizationId, actorId: a.userId, walletId: a.walletId, agentId: agent.id });
    await policies.activate({ organizationId: a.organizationId, actorId: a.userId, scopeId: access.policyScope.id, versionId: access.policyDraft.id });
    await workspaces.setAssignmentStatus({ organizationId: a.organizationId, actorId: a.userId, assignmentId: access.assignment.id, status: "active" });
    const credential = await workspaces.issueCredential({ organizationId: a.organizationId, actorId: a.userId, assignmentId: access.assignment.id, name: "test", tokenPrefix: crypto.randomUUID(), tokenHash: Buffer.from(hexHash(crypto.randomUUID()), "hex") });
    return { ...a, agentId: agent.id, assignmentId: access.assignment.id, credentialId: credential.id };
  }
  return { db, a, b: await add("Agent B"), c: await add("Agent C"), workspaces, policies };
}

async function intent(db: ReturnType<typeof openDb>["db"], subject: Fixture, amount: bigint, key = crypto.randomUUID()) {
  return (await new IntentRepository(db).createOrLoad({ ...subject, idempotencyKey: key, requestHash: hexHash(`${amount}-${key}`), purposeTag: hexHash(`${subject.assignmentId}-${key}`), recipient: address("3", "feed"), amountMist: amount, reasoningJson: { decision: "shared-wallet test" } })).intent;
}

describe("different agents sharing a wallet", () => {
  test("serializes competing assignments against one shared cap", async () => {
    const { db, a, b } = await setup();
    const first = await intent(db, a, 7n);
    const second = await intent(db, b, 7n);
    const outcomes = await Promise.allSettled([a, b].map((subject, index) => new ReservationRepository(connection().db).reserve({ ...subject, intentId: index === 0 ? first.id : second.id, ttlMs: 60_000 })));
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === "rejected");
    expect(rejected && rejected.status === "rejected" && rejected.reason).toMatchObject({ scope: "wallet", periodKind: "day" });
    const [shared] = await db.select().from(schema.walletBudgetCounters).where(and(eq(schema.walletBudgetCounters.walletId, a.walletId), eq(schema.walletBudgetCounters.periodKind, "day")));
    expect(shared?.reservedMist).toBe("7");
    const individuals = await db.select().from(schema.assignmentBudgetCounters).where(eq(schema.assignmentBudgetCounters.periodKind, "day"));
    expect(individuals.filter((row) => [a.assignmentId, b.assignmentId].includes(row.assignmentId)).reduce((sum, row) => sum + BigInt(row.reservedMist), 0n)).toBe(7n);
  });

  test("A's personal cap leaves B's allowance intact; retries count once and survive a new connection", async () => {
    const { db, a, b, policies } = await setup(20n);
    const [scope] = await db.select().from(schema.policyScopes).where(eq(schema.policyScopes.assignmentId, a.assignmentId));
    const draft = await policies.createDraft({ organizationId: a.organizationId, scopeId: scope!.id, createdByUserId: a.userId, maxPerTxMist: 3n, maxPerDayMist: 3n, maxPerMonthMist: 3n, blockRiskScoreAt: 90, requireSimulation: true });
    await policies.activate({ organizationId: a.organizationId, actorId: a.userId, scopeId: scope!.id, versionId: draft.id });
    const first = await intent(db, a, 3n, "same-request-key");
    const reserve = (subject: Fixture, id: string) => new ReservationRepository(db).reserve({ ...subject, intentId: id, ttlMs: 60_000 });
    await reserve(a, first.id);
    expect((await reserve(a, first.id)).kind).toBe("existing");
    const next = await intent(db, a, 1n);
    await expect(reserve(a, next.id)).rejects.toMatchObject({ scope: "assignment", periodKind: "day" });
    const other = await intent(db, b, 3n, "same-request-key");
    expect(other.id).not.toBe(first.id);
    await reserve(b, other.id);
    const snapshot = await new SpendingPreviewRepository(connection().db).snapshot(b);
    expect(snapshot.usage.wallet.day.reservedMist).toBe("6");
    expect(snapshot.usage.assignment.day.reservedMist).toBe("3");
  });

  test("wallet detail is scoped, counts each allowance once and ignores old counter windows", async () => {
    const { db, a, b, c, workspaces } = await setup();
    const org = (await workspaces.organizationForMember(a.organizationId, a.userId))!.organization;
    const outsider = await createFixture(db);
    const now = new Date("2026-09-30T12:00:00Z");
    await db.insert(schema.walletBudgetCounters).values([
      { walletId: a.walletId, periodKind: "day", periodStart: new Date("2026-09-30"), spentMist: "2", reservedMist: "1" },
      { walletId: a.walletId, periodKind: "day", periodStart: new Date("2026-09-29"), spentMist: "9" },
    ]);
    await workspaces.issueCredential({ organizationId: a.organizationId, actorId: a.userId, assignmentId: b.assignmentId, name: "extra", tokenPrefix: crypto.randomUUID(), tokenHash: Buffer.from(hexHash(crypto.randomUUID()), "hex") });
    const detail = (await workspaces.walletDetailForMember(org.slug, a.userId, a.walletId, now))!;
    expect(detail.assignments.map((row) => row.agentId).sort()).toEqual([a.agentId, b.agentId, c.agentId].sort());
    expect(detail.walletCounters).toHaveLength(1);
    expect(detail.walletCounters[0]?.counter.spentMist).toBe("2");
    expect(detail.credentials).toHaveLength(4);
    expect(detail.credentials.every((row) => !("tokenHash" in row))).toBe(true);
    expect(await workspaces.walletDetailForMember(org.slug, outsider.userId, a.walletId)).toBeNull();
    expect(await workspaces.walletDetailForMember(org.slug, a.userId, outsider.walletId)).toBeNull();
    await workspaces.setAssignmentStatus({ organizationId: a.organizationId, actorId: a.userId, assignmentId: c.assignmentId, status: "archived" });
    const afterArchive = (await workspaces.walletDetailForMember(org.slug, a.userId, a.walletId))!;
    expect(afterArchive.assignments).toHaveLength(2);
    expect(afterArchive.agents.some((agent) => agent.id === c.agentId)).toBe(false);
  });

  test("preview neither creates spending state nor accepts changed identity or revoked access", async () => {
    const { db, a, b, workspaces } = await setup();
    const repository = new SpendingPreviewRepository(db);
    expect((await repository.snapshot(a)).usage.wallet.day).toEqual({ spentMist: "0", reservedMist: "0" });
    expect(await db.select().from(schema.walletBudgetCounters).where(eq(schema.walletBudgetCounters.walletId, a.walletId))).toHaveLength(0);
    expect(await db.select().from(schema.spendIntents).where(eq(schema.spendIntents.organizationId, a.organizationId))).toHaveLength(0);
    await expect(repository.snapshot({ ...a, credentialId: b.credentialId })).rejects.toMatchObject({ code: "PREVIEW_IDENTITY_INACTIVE" });
    await workspaces.revokeCredential({ organizationId: a.organizationId, actorId: a.userId, credentialId: a.credentialId });
    await expect(repository.snapshot(a)).rejects.toMatchObject({ code: "PREVIEW_IDENTITY_INACTIVE" });
    await workspaces.setWalletStatus({ organizationId: b.organizationId, actorId: b.userId, walletId: b.walletId, status: "suspended" });
    await expect(repository.snapshot(b)).rejects.toMatchObject({ code: "PREVIEW_IDENTITY_INACTIVE" });
  });

  test("execution does not inherit authority from a preview taken before policy and access changes", async () => {
    const { db, a, b, c, workspaces, policies } = await setup();
    const previews = new SpendingPreviewRepository(db);
    await Promise.all([a, b, c].map((subject) => previews.snapshot(subject)));
    const [scope] = await db.select().from(schema.policyScopes).where(eq(schema.policyScopes.assignmentId, a.assignmentId));
    const draft = await policies.createDraft({ organizationId: a.organizationId, scopeId: scope!.id, createdByUserId: a.userId, maxPerTxMist: 1n, maxPerDayMist: 1n, maxPerMonthMist: 1n, blockRiskScoreAt: 90, requireSimulation: true });
    await policies.activate({ organizationId: a.organizationId, actorId: a.userId, scopeId: scope!.id, versionId: draft.id });
    const attempt = await intent(db, a, 3n);
    const reservations = new ReservationRepository(db);
    expect((await reservations.reserve({ ...a, intentId: attempt.id, ttlMs: 60_000 })).kind).toBe("blocked");
    const revoked = await intent(db, b, 3n);
    await workspaces.revokeCredential({ organizationId: b.organizationId, actorId: b.userId, credentialId: b.credentialId });
    await expect(reservations.reserve({ ...b, intentId: revoked.id, ttlMs: 60_000 })).rejects.toMatchObject({ code: "RESERVATION_CREDENTIAL_INVALID" });
    const paused = await intent(db, c, 3n);
    await workspaces.setAssignmentStatus({ organizationId: c.organizationId, actorId: c.userId, assignmentId: c.assignmentId, status: "disabled" });
    await expect(reservations.reserve({ ...c, intentId: paused.id, ttlMs: 60_000 })).rejects.toMatchObject({ code: "RESERVATION_IDENTITY_INACTIVE" });
    expect(await db.select().from(schema.budgetReservations).where(eq(schema.budgetReservations.organizationId, a.organizationId))).toHaveLength(0);
  });
});
