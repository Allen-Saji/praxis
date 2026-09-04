import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { IntentRepository } from "../src/repositories/intents";
import { PolicyRepository } from "../src/repositories/policies";
import { BudgetLimitError, ReservationRepository } from "../src/repositories/reservations";
import { assignmentBudgetCounters, spendIntents, walletBudgetCounters } from "../src/schema";
import { address, cleanupFixture, createActivePolicies, createFixture, databaseUrl, hexHash, openDb, type Fixture } from "./support";

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

async function activatePoliciesWithRules(db: ReturnType<typeof openDb>["db"], fixture: Fixture, walletRules: { recipient: string; effect: "allow" | "deny" }[], assignmentRules: { recipient: string; effect: "allow" | "deny" }[]) {
  const repository = new PolicyRepository(db);
  const walletScope = await repository.createScope({ organizationId: fixture.organizationId, actorId: fixture.userId, scopeType: "wallet", walletId: fixture.walletId });
  const assignmentScope = await repository.createScope({ organizationId: fixture.organizationId, actorId: fixture.userId, scopeType: "assignment", assignmentId: fixture.assignmentId });
  const base = { organizationId: fixture.organizationId, createdByUserId: fixture.userId, maxPerTxMist: 10n, maxPerDayMist: 10n, maxPerMonthMist: 10n, blockRiskScoreAt: 90, requireSimulation: true as const };
  const walletPolicy = await repository.createDraft({ ...base, scopeId: walletScope.id, version: 1, rules: walletRules });
  const assignmentPolicy = await repository.createDraft({ ...base, scopeId: assignmentScope.id, version: 1, rules: assignmentRules });
  await repository.activate({ scopeId: walletScope.id, versionId: walletPolicy.id, organizationId: fixture.organizationId, actorId: fixture.userId });
  await repository.activate({ scopeId: assignmentScope.id, versionId: assignmentPolicy.id, organizationId: fixture.organizationId, actorId: fixture.userId });
}

async function createIntent(db: ReturnType<typeof openDb>["db"], fixture: Fixture, suffix: string, amountMist = 1n) {
  const repository = new IntentRepository(db);
  const created = await repository.createOrLoad({
    ...fixture,
    idempotencyKey: `reservation-${suffix}`,
    requestHash: hexHash(`hash-${suffix}`),
    purposeTag: hexHash(`purpose-${suffix}`),
    recipient: address("3"),
    amountMist,
    reasoningJson: { prompt: "p", decision: "d", model: "m" },
  });
  if (created.kind !== "created") throw new Error("reservation fixture intent was not created");
  return created.intent;
}

describe("ReservationRepository", () => {
  test("keeps settlement tenant- and evidence-bound", async () => {
    const value = connection();
    const fixture = await createFixture(value.db);
    await createActivePolicies(value.db, fixture);
    const intent = await createIntent(value.db, fixture, crypto.randomUUID(), 1n);
    const repository = new ReservationRepository(value.db);
    const reserved = await repository.reserve({ intentId: intent.id, organizationId: fixture.organizationId, walletId: fixture.walletId, assignmentId: fixture.assignmentId, ttlMs: 60_000 });
    if (reserved.kind !== "created") throw new Error("expected reservation");
    const definiteProof = { kind: "definite_nonexecution" as const, intentId: intent.id, purposeTag: intent.purposeTag, noSubmission: true as const, failureCode: "NO_SIGNATURE" };
    expect(await repository.releaseDefiniteNonExecution({ organizationId: crypto.randomUUID(), reservationId: reserved.reservation.id, proof: definiteProof })).toBeNull();

    const intents = new IntentRepository(value.db);
    expect((await intents.transition(intent.id, "reserved", 1, "simulating", { organizationId: fixture.organizationId }))?.state).toBe("simulating");
    expect((await intents.transition(intent.id, "simulating", 2, "evidence_pending", { organizationId: fixture.organizationId }))?.state).toBe("evidence_pending");
    expect((await intents.transition(intent.id, "evidence_pending", 3, "evidence_published", { organizationId: fixture.organizationId }))?.state).toBe("evidence_published");
    expect((await intents.transition(intent.id, "evidence_published", 4, "signing", { organizationId: fixture.organizationId }))?.state).toBe("signing");
    const txDigest = hexHash("submitted-settlement");
    expect((await intents.transition(intent.id, "signing", 5, "submitted", { organizationId: fixture.organizationId, txDigest }))?.state).toBe("submitted");
    await expect(repository.releaseDefiniteNonExecution({ organizationId: fixture.organizationId, reservationId: reserved.reservation.id, proof: definiteProof })).rejects.toMatchObject({ code: "INTENT_NOT_RELEASABLE" });

    const wrongIntentProof = { kind: "confirmed" as const, outcome: "confirmed" as const, txDigest, checkedAt: new Date(), evidence: { kind: "operator_review" as const, intentId: crypto.randomUUID(), purposeTag: intent.purposeTag, reviewId: "wrong-intent" } };
    await expect(repository.commit({ organizationId: fixture.organizationId, reservationId: reserved.reservation.id, proof: wrongIntentProof })).rejects.toMatchObject({ code: "RECONCILIATION_PROOF_REQUIRED" });
    const submittedEvidence = { kind: "submitted" as const, outcome: "submitted" as const, txDigest, checkedAt: new Date(), evidence: { kind: "operator_review" as const, intentId: intent.id, purposeTag: intent.purposeTag, reviewId: "submitted" } };
    expect((await intents.transition(intent.id, "submitted", 6, "submission_unknown", { organizationId: fixture.organizationId, txDigest, guard: submittedEvidence }))?.state).toBe("submission_unknown");
    await expect(repository.releaseReconciledUnknown({ organizationId: fixture.organizationId, reservationId: reserved.reservation.id, proof: { ...submittedEvidence, kind: "no_success", outcome: "not_found", evidence: { ...submittedEvidence.evidence, purposeTag: hexHash("wrong-purpose") } } })).rejects.toMatchObject({ code: "RECONCILIATION_PROOF_REQUIRED" });
    const noSuccess = { kind: "no_success" as const, outcome: "not_found" as const, checkedAt: new Date(), evidence: { kind: "operator_review" as const, intentId: intent.id, purposeTag: intent.purposeTag, reviewId: "reconciled" } };
    const released = await repository.releaseReconciledUnknown({ organizationId: fixture.organizationId, reservationId: reserved.reservation.id, proof: noSuccess });
    expect(released?.changed).toBe(true);
    expect(released?.reservation.state).toBe("released");
    await cleanupFixture(value.db, fixture);
  });

  test("evaluates wallet and assignment allowlists independently and gives deny precedence", async () => {
    const value = connection();
    const fixture = await createFixture(value.db);
    const intent = await createIntent(value.db, fixture, crypto.randomUUID(), 1n);
    const otherRecipient = address("4");
    await activatePoliciesWithRules(value.db, fixture, [{ recipient: intent.recipient, effect: "allow" }], [{ recipient: otherRecipient, effect: "allow" }]);
    const blocked = await new ReservationRepository(value.db).reserve({ intentId: intent.id, organizationId: fixture.organizationId, walletId: fixture.walletId, assignmentId: fixture.assignmentId, ttlMs: 60_000 });
    expect(blocked.kind).toBe("blocked");
    const secondFixture = await createFixture(value.db);
    const secondIntent = await createIntent(value.db, secondFixture, crypto.randomUUID(), 1n);
    await activatePoliciesWithRules(value.db, secondFixture, [{ recipient: secondIntent.recipient, effect: "allow" }], [{ recipient: secondIntent.recipient, effect: "deny" }]);
    const denied = await new ReservationRepository(value.db).reserve({ intentId: secondIntent.id, organizationId: secondFixture.organizationId, walletId: secondFixture.walletId, assignmentId: secondFixture.assignmentId, ttlMs: 60_000 });
    expect(denied.kind).toBe("blocked");
    // Active policy rules are append-only and cannot be deleted. These two
    // fixtures remain isolated by organization in the disposable database.
  });

  test("locks wallet and assignment counters so concurrent requests cannot overspend", async () => {
    const fixtureConnection = connection();
    const fixture = await createFixture(fixtureConnection.db);
    await createActivePolicies(fixtureConnection.db, fixture);
    const firstIntent = await createIntent(fixtureConnection.db, fixture, crypto.randomUUID(), 7n);
    const secondIntent = await createIntent(fixtureConnection.db, fixture, crypto.randomUUID(), 7n);
    const first = connection();
    const second = connection();
    const at = new Date("2026-09-04T10:00:00.000Z");

    const outcomes = await Promise.all([
      new ReservationRepository(first.db).reserve({
        intentId: firstIntent.id,
        organizationId: fixture.organizationId,
        walletId: fixture.walletId,
        assignmentId: fixture.assignmentId,
        amountMist: 7n,
        ttlMs: 60_000,
      }).then((result) => ({ kind: "success" as const, result })).catch((error: unknown) => ({ kind: "error" as const, error })),
      new ReservationRepository(second.db).reserve({
        intentId: secondIntent.id,
        organizationId: fixture.organizationId,
        walletId: fixture.walletId,
        assignmentId: fixture.assignmentId,
        amountMist: 7n,
        ttlMs: 60_000,
      }).then((result) => ({ kind: "success" as const, result })).catch((error: unknown) => ({ kind: "error" as const, error })),
    ]);
    expect(outcomes.filter((value) => value.kind === "success")).toHaveLength(1);
    expect(outcomes.filter((value) => value.kind === "error" && value.error instanceof BudgetLimitError)).toHaveLength(1);
    await cleanupFixture(fixtureConnection.db, fixture);
  });

  test("supports idempotent reserve, release, and commit operations", async () => {
    const value = connection();
    const fixture = await createFixture(value.db);
    await createActivePolicies(value.db, fixture);
    const intent = await createIntent(value.db, fixture, crypto.randomUUID(), 4n);
    const repository = new ReservationRepository(value.db);
    const input = {
      intentId: intent.id,
      organizationId: fixture.organizationId,
      walletId: fixture.walletId,
      assignmentId: fixture.assignmentId,
      amountMist: 4n,
      ttlMs: 60_000,
    };
    const created = await repository.reserve(input);
    const existing = await repository.reserve(input);
    expect(created.kind).toBe("created");
    expect(existing.kind).toBe("existing");
    if (created.kind !== "created") throw new Error("expected reservation");

    const intentRepository = new IntentRepository(value.db);
    expect((await intentRepository.transition(intent.id, "reserved", 1, "simulating", { organizationId: fixture.organizationId }))?.state).toBe("simulating");
    const releaseProof = { kind: "definite_nonexecution" as const, intentId: intent.id, purposeTag: intent.purposeTag, noSubmission: true as const, failureCode: "SIMULATION_FAILED" };
    const released = await repository.releaseDefiniteNonExecution({ organizationId: fixture.organizationId, reservationId: created.reservation.id, proof: releaseProof });
    expect(released?.changed).toBe(true);
    expect(released?.reservation.state).toBe("released");
    expect((await repository.release({ organizationId: fixture.organizationId, reservationId: created.reservation.id, proof: releaseProof }))?.changed).toBe(false);

    const expiringIntent = await createIntent(value.db, fixture, crypto.randomUUID(), 1n);
    const expiring = await repository.reserve({ ...input, intentId: expiringIntent.id, amountMist: 1n, ttlMs: 1_000 });
    if (expiring.kind !== "created") throw new Error("expected expiring reservation");
    await expect(repository.expire({ organizationId: fixture.organizationId, reservationId: expiring.reservation.id })).rejects.toMatchObject({ code: "RESERVATION_NOT_EXPIRED" });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const expired = await repository.expire({ organizationId: fixture.organizationId, reservationId: expiring.reservation.id });
    expect(expired?.changed).toBe(true);
    expect(expired?.reservation.state).toBe("expired");
    const [expiredIntent] = await value.db.select({ state: spendIntents.state }).from(spendIntents).where(eq(spendIntents.id, expiringIntent.id));
    expect(expiredIntent?.state).toBe("expired");

    const secondIntent = await createIntent(value.db, fixture, crypto.randomUUID(), 3n);
    const committed = await repository.reserve({ ...input, intentId: secondIntent.id, amountMist: 3n });
    if (committed.kind !== "created") throw new Error("expected second reservation");
    expect((await intentRepository.transition(secondIntent.id, "reserved", 1, "simulating", { organizationId: fixture.organizationId }))?.state).toBe("simulating");
    expect((await intentRepository.transition(secondIntent.id, "simulating", 2, "evidence_pending", { organizationId: fixture.organizationId }))?.state).toBe("evidence_pending");
    expect((await intentRepository.transition(secondIntent.id, "evidence_pending", 3, "evidence_published", { organizationId: fixture.organizationId }))?.state).toBe("evidence_published");
    expect((await intentRepository.transition(secondIntent.id, "evidence_published", 4, "signing", { organizationId: fixture.organizationId }))?.state).toBe("signing");
    expect((await intentRepository.transition(secondIntent.id, "signing", 5, "submitted", { organizationId: fixture.organizationId, txDigest: hexHash("submitted") }))?.state).toBe("submitted");
    const commitProof = { kind: "confirmed" as const, outcome: "confirmed" as const, txDigest: hexHash("confirmed"), checkedAt: new Date(), evidence: { kind: "operator_review" as const, intentId: secondIntent.id, purposeTag: secondIntent.purposeTag, reviewId: "review-confirm" } };
    expect((await repository.commit({ organizationId: fixture.organizationId, reservationId: committed.reservation.id, proof: commitProof }))?.changed).toBe(true);
    expect((await repository.commit({ organizationId: fixture.organizationId, reservationId: committed.reservation.id, proof: commitProof }))?.changed).toBe(false);

    const [walletCounter] = await value.db.select().from(walletBudgetCounters).where(and(eq(walletBudgetCounters.walletId, fixture.walletId), eq(walletBudgetCounters.periodKind, "day")));
    const [assignmentCounter] = await value.db.select().from(assignmentBudgetCounters).where(and(eq(assignmentBudgetCounters.assignmentId, fixture.assignmentId), eq(assignmentBudgetCounters.periodKind, "day")));
    expect(walletCounter?.reservedMist).toBe("0");
    expect(walletCounter?.spentMist).toBe("3");
    expect(assignmentCounter?.reservedMist).toBe("0");
    expect(assignmentCounter?.spentMist).toBe("3");
    await cleanupFixture(value.db, fixture);
  });

  test("releases an evidence-published intent when pre-sign revalidation fails", async () => {
    const value = connection();
    const fixture = await createFixture(value.db);
    await createActivePolicies(value.db, fixture);
    const intent = await createIntent(value.db, fixture, crypto.randomUUID(), 2n);
    const repository = new ReservationRepository(value.db);
    const reserved = await repository.reserve({ intentId: intent.id, organizationId: fixture.organizationId, walletId: fixture.walletId, assignmentId: fixture.assignmentId, amountMist: 2n, ttlMs: 60_000 });
    if (reserved.kind !== "created") throw new Error("expected reservation");
    const intents = new IntentRepository(value.db);
    const simulating = await intents.transition(intent.id, "reserved", 1, "simulating", { organizationId: fixture.organizationId });
    const pending = await intents.transition(intent.id, "simulating", simulating!.stateVersion, "evidence_pending", { organizationId: fixture.organizationId });
    const published = await intents.transition(intent.id, "evidence_pending", pending!.stateVersion, "evidence_published", { organizationId: fixture.organizationId });
    expect(published?.state).toBe("evidence_published");
    const proof = { kind: "definite_nonexecution" as const, intentId: intent.id, purposeTag: intent.purposeTag, noSubmission: true as const, failureCode: "POLICY_CHANGED_BEFORE_SIGN" };
    const released = await repository.releasePreSign({ organizationId: fixture.organizationId, reservationId: reserved.reservation.id, proof });
    expect(released?.changed).toBe(true);
    const current = await intents.byId(fixture.organizationId, intent.id);
    expect(current).toMatchObject({ state: "failed", outcome: "failed", failureCode: "POLICY_CHANGED_BEFORE_SIGN" });
    await cleanupFixture(value.db, fixture);
  });

  test("persists counters across a client restart and uses UTC day/month boundaries", async () => {
    const value = connection();
    const fixture = await createFixture(value.db);
    await createActivePolicies(value.db, fixture);
    const intent = await createIntent(value.db, fixture, crypto.randomUUID(), 2n);
    const at = new Date();
    const result = await new ReservationRepository(value.db).reserve({
      intentId: intent.id,
      organizationId: fixture.organizationId,
      walletId: fixture.walletId,
      assignmentId: fixture.assignmentId,
      amountMist: 2n,
      ttlMs: 60_000,
    });
    expect(result.kind).toBe("created");
    await value.client.end();

    const restarted = connection();
    const [day] = await restarted.db.select().from(walletBudgetCounters).where(and(eq(walletBudgetCounters.walletId, fixture.walletId), eq(walletBudgetCounters.periodKind, "day")));
    const [month] = await restarted.db.select().from(walletBudgetCounters).where(and(eq(walletBudgetCounters.walletId, fixture.walletId), eq(walletBudgetCounters.periodKind, "month")));
    expect(day?.periodStart.toISOString()).toBe(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())).toISOString());
    expect(month?.periodStart.toISOString()).toBe(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString());
    expect(day?.reservedMist).toBe("2");
    expect(month?.reservedMist).toBe("2");
    await cleanupFixture(restarted.db, fixture);
  });

  test("keeps wallet and assignment totals bounded over 20 concurrent requests", async () => {
    const fixtureConnection = connection();
    const fixture = await createFixture(fixtureConnection.db);
    await createActivePolicies(fixtureConnection.db, fixture, { maxPerTxMist: 5n, maxPerDayMist: 5n, maxPerMonthMist: 5n });
    const intents = await Promise.all(Array.from({ length: 20 }, (_, index) => createIntent(fixtureConnection.db, fixture, `${crypto.randomUUID()}-${index}`)));
    const runners = intents.map(() => connection());
    const outcomes = await Promise.all(intents.map((intent, index) => new ReservationRepository(runners[index]!.db).reserve({
      intentId: intent.id,
      organizationId: fixture.organizationId,
      walletId: fixture.walletId,
      assignmentId: fixture.assignmentId,
      amountMist: 1n,
      ttlMs: 60_000,
    }).then((result) => ({ kind: "success" as const, result })).catch((error: unknown) => ({ kind: "error" as const, error }))));
    expect(outcomes.filter((value) => value.kind === "success")).toHaveLength(5);
    expect(outcomes.filter((value) => value.kind === "error" && value.error instanceof BudgetLimitError)).toHaveLength(15);

    const [walletCounter] = await fixtureConnection.db.select().from(walletBudgetCounters).where(and(eq(walletBudgetCounters.walletId, fixture.walletId), eq(walletBudgetCounters.periodKind, "day")));
    const [assignmentCounter] = await fixtureConnection.db.select().from(assignmentBudgetCounters).where(and(eq(assignmentBudgetCounters.assignmentId, fixture.assignmentId), eq(assignmentBudgetCounters.periodKind, "day")));
    expect(BigInt(walletCounter?.reservedMist ?? "0") + BigInt(walletCounter?.spentMist ?? "0")).toBe(5n);
    expect(BigInt(assignmentCounter?.reservedMist ?? "0") + BigInt(assignmentCounter?.spentMist ?? "0")).toBe(5n);
    await cleanupFixture(fixtureConnection.db, fixture);
  });
});
