import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { IntentRepository } from "../src/repositories/intents";
import { PolicyRepository } from "../src/repositories/policies";
import { auditEvents, spendIntents } from "../src/schema";
import { address, cleanupFixture, createFixture, databaseUrl, hexHash, openDb, type Fixture } from "./support";

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

function intentInput(context: Fixture, key: string, requestHash = `hash-${key}`, purposeTag = `purpose-${key}`) {
  return {
    ...context,
    idempotencyKey: key,
    requestHash: /^[0-9a-f]{64}$/.test(requestHash) ? requestHash : hexHash(requestHash),
    purposeTag: /^[0-9a-f]{64}$/.test(purposeTag) ? purposeTag : hexHash(purposeTag),
    recipient: address("3"),
    amountMist: 2n,
    reasoningJson: { prompt: "p", decision: "d", model: "m" },
  };
}

describe("IntentRepository", () => {
  test("creates one intent for a replay and rejects changed content", async () => {
    const value = connection();
    const context = await createFixture(value.db);
    const repository = new IntentRepository(value.db);
    const input = intentInput(context, `replay-${crypto.randomUUID()}`);
    const first = await repository.createOrLoad(input);
    expect(first.kind).toBe("created");
    if (first.kind !== "created") throw new Error("fixture must create an intent");
    const firstAudit = await value.db.select({ id: auditEvents.id }).from(auditEvents).where(and(eq(auditEvents.organizationId, context.organizationId), eq(auditEvents.subjectId, first.intent.id), eq(auditEvents.eventType, "intent_created")));
    expect(firstAudit).toHaveLength(1);
    expect((await repository.createOrLoad(input)).kind).toBe("existing");
    const replayAudit = await value.db.select({ id: auditEvents.id }).from(auditEvents).where(and(eq(auditEvents.organizationId, context.organizationId), eq(auditEvents.subjectId, first.intent.id), eq(auditEvents.eventType, "intent_created")));
    expect(replayAudit).toHaveLength(1);
    expect((await repository.createOrLoad({ ...input, requestHash: hexHash(`${input.requestHash}-changed`), purposeTag: hexHash(`${input.purposeTag}-changed`) })).kind).toBe("conflict");
    await cleanupFixture(value.db, context);
  });

  test("uses state version as a compare-and-swap guard", async () => {
    const value = connection();
    const context = await createFixture(value.db);
    const repository = new IntentRepository(value.db);
    const created = await repository.createOrLoad(intentInput(context, `cas-${crypto.randomUUID()}`));
    if (created.kind !== "created") throw new Error("fixture must create an intent");
    const transition = {
      organizationId: context.organizationId,
      outcome: "failed" as const,
    };
    expect((await repository.transition(created.intent.id, "received", 0, "failed", transition))?.state).toBe("failed");
    expect(await repository.transition(created.intent.id, "received", 0, "failed", transition)).toBeNull();
    await cleanupFixture(value.db, context);
  });

  test("does not accept caller-fabricated policy snapshots", async () => {
    const value = connection();
    const context = await createFixture(value.db);
    const repository = new IntentRepository(value.db);
    const created = await repository.createOrLoad(intentInput(context, `snapshot-${crypto.randomUUID()}`));
    if (created.kind !== "created") throw new Error("fixture must create an intent");
    const fabricated = {
      organizationId: context.organizationId,
      walletPolicyVersionId: crypto.randomUUID(),
      walletPolicyHash: hexHash("wallet-fabricated"),
      assignmentPolicyVersionId: crypto.randomUUID(),
      assignmentPolicyHash: hexHash("assignment-fabricated"),
      effectivePolicyHash: hexHash("effective-fabricated"),
      policySnapshotJson: { wallet: "fabricated", assignment: "fabricated" },
      outcome: "failed",
      failureCode: "FABRICATED_SNAPSHOT_TEST",
    } as never;
    const transitioned = await repository.transition(created.intent.id, "received", 0, "failed", fabricated);
    expect(transitioned?.state).toBe("failed");
    const [stored] = await value.db.select().from(spendIntents).where(eq(spendIntents.id, created.intent.id));
    expect(stored?.walletPolicyVersionId).toBeNull();
    expect(stored?.policySnapshotJson).toBeNull();
    await cleanupFixture(value.db, context);
  });

  test("concurrent identical requests create one row", async () => {
    const fixtureConnection = connection();
    const context = await createFixture(fixtureConnection.db);
    const first = connection();
    const second = connection();
    const input = intentInput(context, `concurrent-${crypto.randomUUID()}`);
    const [one, two] = await Promise.all([
      new IntentRepository(first.db).createOrLoad(input),
      new IntentRepository(second.db).createOrLoad(input),
    ]);
    expect([one.kind, two.kind].sort()).toEqual(["created", "existing"]);
    const rows = await fixtureConnection.db.select({ id: spendIntents.id }).from(spendIntents).where(eq(spendIntents.idempotencyKey, input.idempotencyKey));
    expect(rows).toHaveLength(1);
    await cleanupFixture(fixtureConnection.db, context);
  });

  test("turns a purpose-tag collision into a typed conflict", async () => {
    const value = connection();
    const context = await createFixture(value.db);
    const repository = new IntentRepository(value.db);
    const input = intentInput(context, `purpose-a-${crypto.randomUUID()}`);
    const first = await repository.createOrLoad(input);
    expect(first.kind).toBe("created");
    await expect(repository.createOrLoad({ ...input, idempotencyKey: `purpose-b-${crypto.randomUUID()}` })).rejects.toMatchObject({ code: "PURPOSE_TAG_CONFLICT" });
    await cleanupFixture(value.db, context);
  });
});
