import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { VaultSubmissionRepository } from "../src/repositories/vault-submissions";
import { IntentRepository } from "../src/repositories/intents";
import { address, createFixture, databaseUrl, hexHash, openDb } from "./support";
const test = databaseUrl ? it : it.skip;
const connections: ReturnType<typeof openDb>[] = [];
afterAll(async () => { await Promise.all(connections.map(({ client }) => client.end())); });
async function fixture() {
  const connection = openDb(); connections.push(connection);
  const f = await createFixture(connection.db);
  const intent = await new IntentRepository(connection.db).createOrLoad({ ...f, idempotencyKey: crypto.randomUUID(), requestHash: hexHash(crypto.randomUUID()), purposeTag: hexHash(crypto.randomUUID()), recipient: address("3"), amountMist: 1n, reasoningJson: { prompt: "p", decision: "d", model: "m" } });
  return { ...connection, ...f, intentId: intent.intent.id };
}
function row(intentId: string, vaultId = address("7", crypto.randomUUID().slice(0, 8))) {
  return { intentId, network: "testnet" as const, packageId: address("1"), vaultId, agentAddress: address("2"), sequence: "0", digest: crypto.randomUUID(), transactionBytes: "AQI=", signature: "test-signature", requestJson: { test: true }, gasBudget: "1000" };
}

describe("vault submission journal", () => {
  test("retains a signed envelope across connections and scopes reads by tenant", async () => {
    const f = await fixture();
    const entry = row(f.intentId);
    await new VaultSubmissionRepository(f.db, f.organizationId).saveOnce(entry);
    const second = openDb(); connections.push(second);
    expect((await new VaultSubmissionRepository(second.db, f.organizationId).load(f.intentId))?.digest).toBe(entry.digest);
    expect(await new VaultSubmissionRepository(second.db, crypto.randomUUID()).load(f.intentId)).toBeNull();
    await expect(new VaultSubmissionRepository(second.db, f.organizationId).saveOnce({ ...entry, digest: crypto.randomUUID() })).rejects.toThrow();
    await expect(f.db.execute(sql`UPDATE vault_submissions SET signature = 'changed' WHERE intent_id = ${f.intentId}`)).rejects.toThrow();
  });

  test("rejects cross-tenant inserts and two intents claiming one sequence", async () => {
    const first = await fixture(); const second = await fixture();
    const entry = row(first.intentId);
    await expect(new VaultSubmissionRepository(first.db, second.organizationId).saveOnce(entry)).rejects.toThrow();
    const outcomes = await Promise.allSettled([
      new VaultSubmissionRepository(first.db, first.organizationId).saveOnce(entry),
      new VaultSubmissionRepository(second.db, second.organizationId).saveOnce({ ...entry, intentId: second.intentId, digest: crypto.randomUUID() }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});
