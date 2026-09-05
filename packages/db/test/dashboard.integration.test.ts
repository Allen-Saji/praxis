import { describe, expect, it } from "vitest";
import { WorkspaceRepository } from "../src/repositories/workspaces";
import { spendIntents, walletBudgetCounters, agents } from "../src/schema";
import { createFixture, createActivePolicies, databaseUrl, hexHash, openDb } from "./support";
const test = databaseUrl ? it : it.skip;
describe("personal dashboard queries", () => {
  test("aggregates beyond the recent page and isolates UTC windows, agents and tenants", async () => {
    const { db, client } = openDb();
    try {
      const fixture = await createFixture(db); const other = await createFixture(db);
      const { walletPolicy, assignmentPolicy } = await createActivePolicies(db, fixture);
      const now = new Date("2026-09-05T12:00:00Z"); const today = new Date("2026-09-05T00:00:00Z");
      const [quiet] = await db.insert(agents).values({ organizationId: fixture.organizationId, name: "Quiet agent", externalRef: crypto.randomUUID() }).returning();
      const base = { organizationId: fixture.organizationId, walletId: fixture.walletId, assignmentId: fixture.assignmentId, agentId: fixture.agentId, credentialId: fixture.credentialId, recipient: `0x${"3".repeat(64)}`, amountMist: "1000000", coinType: "0x2::sui::SUI", reasoningJson: { decision: "Regression fixture" }, walletPolicyVersionId: walletPolicy.id, walletPolicyHash: walletPolicy.policyHash, assignmentPolicyVersionId: assignmentPolicy.id, assignmentPolicyHash: assignmentPolicy.policyHash, effectivePolicyHash: hexHash("effective"), policySnapshotJson: {} };
      await db.insert(spendIntents).values(Array.from({ length: 61 }, (_, index) => ({ ...base, idempotencyKey: `dashboard-${index}-${crypto.randomUUID()}`, requestHash: hexHash(crypto.randomUUID()), purposeTag: hexHash(crypto.randomUUID()), state: "confirmed" as const, outcome: "confirmed", createdAt: new Date(today.getTime() + index * 1000), confirmedAt: now })));
      await db.insert(spendIntents).values({ ...base, idempotencyKey: `unknown-${crypto.randomUUID()}`, requestHash: hexHash(crypto.randomUUID()), purposeTag: hexHash(crypto.randomUUID()), state: "submission_unknown", createdAt: new Date("2026-08-31T12:00:00Z") });
      await db.insert(spendIntents).values({ ...base, idempotencyKey: `blocked-${crypto.randomUUID()}`, requestHash: hexHash(crypto.randomUUID()), purposeTag: hexHash(crypto.randomUUID()), state: "blocked", outcome: "blocked", createdAt: new Date("2026-09-04T23:59:00Z"), completedAt: now });
      await db.insert(walletBudgetCounters).values([
        { walletId: fixture.walletId, periodKind: "day", periodStart: today, reservedMist: "7", spentMist: "3" },
        { walletId: fixture.walletId, periodKind: "day", periodStart: new Date("2026-09-04T00:00:00Z"), reservedMist: "900", spentMist: "800" },
        { walletId: fixture.walletId, periodKind: "month", periodStart: new Date("2026-09-01T00:00:00Z"), reservedMist: "8", spentMist: "4" },
        { walletId: fixture.walletId, periodKind: "month", periodStart: new Date("2026-08-01T00:00:00Z"), reservedMist: "999", spentMist: "999" },
      ]);
      const repo = new WorkspaceRepository(db); const overview = await repo.workspaceOverview(fixture.organizationId, fixture.userId, now);
      expect(overview?.decisions).toHaveLength(50); expect(overview?.totals.spentToday).toBe("61000000"); expect(overview?.totals.uncertain).toBe(1); expect(overview?.totals.blockedToday).toBe(1);
      expect(overview?.walletCounters.map(({ counter }) => counter.reservedMist).sort()).toEqual(["7", "8"]);
      const tomorrow = await repo.workspaceOverview(fixture.organizationId, fixture.userId, new Date("2026-09-06T00:00:00Z"));
      expect(tomorrow?.totals.spentToday).toBe("0"); expect(tomorrow?.walletCounters).toHaveLength(1);
      const october = await repo.workspaceOverview(fixture.organizationId, fixture.userId, new Date("2026-10-01T00:00:00Z")); expect(october?.walletCounters).toHaveLength(0);
      expect(await repo.workspaceOverview(fixture.organizationId, other.userId, now)).toBeNull();
      expect((await repo.decisionsForMember({ organizationId: fixture.organizationId, userId: fixture.userId, agentId: quiet!.id }))?.decisions).toHaveLength(0);
      expect((await repo.decisionsForMember({ organizationId: fixture.organizationId, userId: fixture.userId, state: "submission_unknown" }))?.decisions).toHaveLength(1);
      expect((await repo.decisionsForMember({ organizationId: other.organizationId, userId: other.userId }))?.decisions).toHaveLength(0);
    } finally { await client.end(); }
  });
});
