import { beforeAll, describe, expect, it } from "vitest";
import { createDb, IntentRepository, agents, assignments, organizations, users, wallets } from "../src";

const databaseUrl = process.env.DATABASE_URL;
const test = databaseUrl ? it : it.skip;
let repository: IntentRepository;
let context: { organizationId: string; assignmentId: string; walletId: string; agentId: string };

beforeAll(async () => {
  if (!databaseUrl) return;
  const { db } = createDb(databaseUrl);
  const [organization] = await db.insert(organizations).values({ slug: `test-${crypto.randomUUID().slice(0, 8)}`, name: "Test organization" }).returning();
  const [user] = await db.insert(users).values({ primarySuiAddress: `0x${crypto.randomUUID().replaceAll("-", "").padEnd(64, "0")}` }).returning();
  const [wallet] = await db.insert(wallets).values({ organizationId: organization.id, label: "test wallet", suiAddress: `0x${crypto.randomUUID().replaceAll("-", "").padEnd(64, "1")}`, adapterRef: "env:TEST" }).returning();
  const [agent] = await db.insert(agents).values({ organizationId: organization.id, name: "test agent", externalRef: crypto.randomUUID() }).returning();
  const [assignment] = await db.insert(assignments).values({ organizationId: organization.id, walletId: wallet.id, agentId: agent.id }).returning();
  repository = new IntentRepository(db);
  context = { organizationId: organization.id, assignmentId: assignment.id, walletId: wallet.id, agentId: agent.id };
});

describe("IntentRepository", () => {
  test("creates one intent for a replay and rejects changed content", async () => {
    const run = crypto.randomUUID().replaceAll("-", ""); const input = { ...context, idempotencyKey: "replay-key", requestHash: `a${run}`.padEnd(64, "a"), purposeTag: `b${run}`.padEnd(64, "b"), recipient: "0x2", amountMist: 1n, reasoningJson: { prompt: "p", decision: "d", model: "m" } };
    expect((await repository.createOrLoad(input)).kind).toBe("created");
    expect((await repository.createOrLoad(input)).kind).toBe("existing");
    expect((await repository.createOrLoad({ ...input, requestHash: `c${run}`.padEnd(64, "c"), purposeTag: `d${run}`.padEnd(64, "d") })).kind).toBe("conflict");
  });

  test("uses state version as a compare-and-swap guard", async () => {
    const run = crypto.randomUUID().replaceAll("-", ""); const created = await repository.createOrLoad({ ...context, idempotencyKey: "cas-key", requestHash: `e${run}`.padEnd(64, "e"), purposeTag: `f${run}`.padEnd(64, "f"), recipient: "0x3", amountMist: 2n, reasoningJson: { prompt: "p", decision: "d", model: "m" } });
    if (created.kind !== "created") throw new Error("fixture must create an intent");
    expect((await repository.transition(created.intent.id, "received", 0, "reserved"))?.state).toBe("reserved");
    expect(await repository.transition(created.intent.id, "received", 0, "reserved")).toBeNull();
  });
});
