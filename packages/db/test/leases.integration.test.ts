import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { WalletExecutionLeaseRepository } from "../src/repositories/leases";
import { agentCredentials, assignments, budgetReservations, spendIntents, walletExecutionLeases } from "../src/schema";
import { address, cleanupFixture, createActivePolicies, createFixture, databaseUrl, hexHash, openDb } from "./support";
import { IntentRepository } from "../src/repositories/intents";
import { ReservationRepository } from "../src/repositories/reservations";

const test = databaseUrl ? it : it.skip;
const connections: ReturnType<typeof openDb>[] = [];
afterAll(async () => Promise.all(connections.map(({ client }) => client.end())));

async function intent(db: ReturnType<typeof openDb>["db"], fixture: Awaited<ReturnType<typeof createFixture>>) {
  const result = await new IntentRepository(db).createOrLoad({ ...fixture, idempotencyKey: `lease-${crypto.randomUUID()}`, requestHash: hexHash(crypto.randomUUID()), purposeTag: hexHash(crypto.randomUUID()), recipient: address("3"), amountMist: 1n, reasoningJson: { prompt: "p", decision: "d", model: "m" } });
  if (result.kind !== "created") throw new Error("intent fixture was not created");
  return result.intent;
}

async function evidencePublished(db: ReturnType<typeof openDb>["db"], fixture: Awaited<ReturnType<typeof createFixture>>) {
  await createActivePolicies(db, fixture);
  const spend = await intent(db, fixture);
  const reservation = await new ReservationRepository(db).reserve({ intentId: spend.id, organizationId: fixture.organizationId, walletId: fixture.walletId, assignmentId: fixture.assignmentId, ttlMs: 60_000 });
  if (reservation.kind !== "created") throw new Error("expected reservation");
  const repository = new IntentRepository(db);
  expect((await repository.transition(spend.id, "reserved", 1, "simulating", { organizationId: fixture.organizationId }))?.state).toBe("simulating");
  expect((await repository.transition(spend.id, "simulating", 2, "evidence_pending", { organizationId: fixture.organizationId }))?.state).toBe("evidence_pending");
  expect((await repository.transition(spend.id, "evidence_pending", 3, "evidence_published", { organizationId: fixture.organizationId }))?.state).toBe("evidence_published");
  return spend;
}

describe("wallet execution leases", () => {
  test("serializes concurrent workers and permits safe owner release", async () => {
    const fixtureConnection = openDb();
    connections.push(fixtureConnection);
    const fixture = await createFixture(fixtureConnection.db);
    const spend = await evidencePublished(fixtureConnection.db, fixture);
    const first = openDb();
    const second = openDb();
    connections.push(first, second);
    const input = { organizationId: fixture.organizationId, walletId: fixture.walletId, intentId: spend.id, ttlMs: 60_000 };
    const outcomes = await Promise.all([
      new WalletExecutionLeaseRepository(first.db).acquire({ ...input, workerId: "worker-a" }).catch((error: unknown) => error),
      new WalletExecutionLeaseRepository(second.db).acquire({ ...input, workerId: "worker-b" }).catch((error: unknown) => error),
    ]);
    expect(outcomes.filter((value) => value && typeof value === "object" && "kind" in value)).toHaveLength(1);
    expect(outcomes.filter((value) => value instanceof Error && (value as { code?: string }).code === "LEASE_BUSY")).toHaveLength(1);
    const acquired = outcomes.find((value) => value && typeof value === "object" && "kind" in value) as { lease: { id: string; workerId: string } };
    expect(await new WalletExecutionLeaseRepository(first.db).release({ organizationId: fixture.organizationId, leaseId: acquired.lease.id, workerId: "wrong-worker" })).toBeNull();
    expect(await new WalletExecutionLeaseRepository(first.db).release({ organizationId: fixture.organizationId, leaseId: acquired.lease.id, workerId: acquired.lease.workerId })).not.toBeNull();
    await cleanupFixture(fixtureConnection.db, fixture);
  });

  test("reclaims an expired lease without crossing tenants", async () => {
    const value = openDb();
    connections.push(value);
    const fixture = await createFixture(value.db);
    const spend = await evidencePublished(value.db, fixture);
    const repository = new WalletExecutionLeaseRepository(value.db);
    const first = await repository.acquire({ organizationId: fixture.organizationId, walletId: fixture.walletId, intentId: spend.id, workerId: "worker-a", ttlMs: 60_000 });
    if (first.kind !== "created") throw new Error("expected lease");
    await value.db.update(walletExecutionLeases).set({ acquiredAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 1_000) }).where(and(eq(walletExecutionLeases.id, first.lease.id), eq(walletExecutionLeases.organizationId, fixture.organizationId)));
    const second = await repository.acquire({ organizationId: fixture.organizationId, walletId: fixture.walletId, intentId: spend.id, workerId: "worker-b", ttlMs: 60_000 });
    expect(second.kind).toBe("created");
    await expect(repository.acquire({ organizationId: crypto.randomUUID(), walletId: fixture.walletId, intentId: spend.id, workerId: "worker-c", ttlMs: 60_000 })).rejects.toMatchObject({ code: "LEASE_IDENTITY_INACTIVE" });
    await cleanupFixture(value.db, fixture);
  });

  test("holds an expired lease for an uncertain signing intent", async () => {
    const value = openDb();
    connections.push(value);
    const fixture = await createFixture(value.db);
    const spend = await evidencePublished(value.db, fixture);
    const repository = new WalletExecutionLeaseRepository(value.db);
    const acquired = await repository.acquire({ organizationId: fixture.organizationId, walletId: fixture.walletId, intentId: spend.id, workerId: "worker-a", ttlMs: 60_000 });
    if (acquired.kind !== "created") throw new Error("expected lease");
    const intents = new IntentRepository(value.db);
    expect((await intents.transition(spend.id, "evidence_published", 4, "signing", { organizationId: fixture.organizationId }))?.state).toBe("signing");
    await value.db.update(walletExecutionLeases).set({ acquiredAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 1_000) }).where(and(eq(walletExecutionLeases.id, acquired.lease.id), eq(walletExecutionLeases.organizationId, fixture.organizationId)));
    expect(await repository.active(fixture.organizationId, fixture.walletId)).toBeNull();
    await expect(repository.acquire({ organizationId: fixture.organizationId, walletId: fixture.walletId, intentId: spend.id, workerId: "worker-b", ttlMs: 60_000 })).rejects.toMatchObject({ code: "LEASE_RECLAIM_BLOCKED" });
    await repository.release({ organizationId: fixture.organizationId, leaseId: acquired.lease.id, workerId: "worker-a" });
    await cleanupFixture(value.db, fixture);
  });

  test("revalidates identity before returning an existing lease", async () => {
    const value = openDb();
    connections.push(value);
    const fixture = await createFixture(value.db);
    const spend = await evidencePublished(value.db, fixture);
    const repository = new WalletExecutionLeaseRepository(value.db);
    const acquired = await repository.acquire({ organizationId: fixture.organizationId, walletId: fixture.walletId, intentId: spend.id, workerId: "worker-a", ttlMs: 60_000 });
    if (acquired.kind !== "created") throw new Error("expected lease");
    await value.db.update(assignments).set({ status: "disabled" }).where(eq(assignments.id, fixture.assignmentId));
    await expect(repository.acquire({ organizationId: fixture.organizationId, walletId: fixture.walletId, intentId: spend.id, workerId: "worker-a", ttlMs: 60_000 })).rejects.toMatchObject({ code: "LEASE_IDENTITY_INACTIVE" });
    await value.db.update(assignments).set({ status: "active" }).where(eq(assignments.id, fixture.assignmentId));
    await value.db.update(agentCredentials).set({ revokedAt: new Date() }).where(eq(agentCredentials.id, fixture.credentialId));
    await expect(repository.acquire({ organizationId: fixture.organizationId, walletId: fixture.walletId, intentId: spend.id, workerId: "worker-a", ttlMs: 60_000 })).rejects.toMatchObject({ code: "LEASE_CREDENTIAL_INVALID" });
    await value.db.update(agentCredentials).set({ revokedAt: null }).where(eq(agentCredentials.id, fixture.credentialId));
    await repository.release({ organizationId: fixture.organizationId, leaseId: acquired.lease.id, workerId: "worker-a" });
    await cleanupFixture(value.db, fixture);
  });

  test("rejects a reservation that expired before signing", async () => {
    const value = openDb();
    connections.push(value);
    const fixture = await createFixture(value.db);
    const spend = await evidencePublished(value.db, fixture);
    await value.db.update(budgetReservations).set({ createdAt: new Date(Date.now() - 2_000), expiresAt: new Date(Date.now() - 1_000) }).where(eq(budgetReservations.intentId, spend.id));
    await expect(new WalletExecutionLeaseRepository(value.db).acquire({ organizationId: fixture.organizationId, walletId: fixture.walletId, intentId: spend.id, workerId: "worker-expired", ttlMs: 60_000 })).rejects.toMatchObject({ code: "LEASE_RESERVATION_EXPIRED" });
    await cleanupFixture(value.db, fixture);
  });
});
