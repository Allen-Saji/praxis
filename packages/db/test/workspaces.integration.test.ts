import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { WorkspaceRepository } from "../src/repositories/workspaces";
import { agentCredentials, auditEvents, organizations, policyScopes, wallets } from "../src/schema";
import { PolicyRepository } from "../src/repositories/policies";
import { address } from "./support";
import { cleanupFixture, createFixture, databaseUrl, openDb } from "./support";

const test = databaseUrl ? it : it.skip;
const connections: ReturnType<typeof openDb>[] = [];

async function expectPostgresCode(operation: Promise<unknown>, expected: string) {
  try {
    await operation;
  } catch (error) {
    const actual = error as { code?: string; cause?: { code?: string } };
    expect(actual.code ?? actual.cause?.code).toBe(expected);
    return;
  }
  throw new Error(`expected PostgreSQL error ${expected}`);
}

afterAll(async () => {
  await Promise.all(connections.map(({ client }) => client.end()));
});

describe("WorkspaceRepository tenant boundaries", () => {
  test("requires membership for organization and object lookups", async () => {
    const value = openDb();
    connections.push(value);
    const first = await createFixture(value.db, crypto.randomUUID().slice(0, 8));
    const second = await createFixture(value.db, crypto.randomUUID().slice(0, 8));
    const repository = new WorkspaceRepository(value.db);

    expect((await repository.organizationForMember(first.organizationId, first.userId))?.organization.id).toBe(first.organizationId);
    expect(await repository.organizationForMember(first.organizationId, second.userId)).toBeNull();
    expect(await repository.organizationForMember(second.organizationId, first.userId)).toBeNull();

    expect((await repository.walletForMember(first.organizationId, first.userId, first.walletId))?.wallet.id).toBe(first.walletId);
    expect(await repository.walletForMember(first.organizationId, second.userId, first.walletId)).toBeNull();
    expect(await repository.walletForMember(second.organizationId, second.userId, first.walletId)).toBeNull();

    expect((await repository.agentForMember(first.organizationId, first.userId, first.agentId))?.agent.id).toBe(first.agentId);
    expect(await repository.agentForMember(first.organizationId, second.userId, first.agentId)).toBeNull();
    expect(await repository.assignmentForMember(first.organizationId, second.userId, first.assignmentId)).toBeNull();
    expect((await repository.assignmentForMember(first.organizationId, first.userId, first.assignmentId))?.assignment.id).toBe(first.assignmentId);
    const firstOrganization = (await repository.organizationForMember(first.organizationId, first.userId))!.organization;
    expect((await repository.organizationBySlugForMember(firstOrganization.slug, first.userId))?.organization.id).toBe(first.organizationId);
    expect(await repository.organizationBySlugForMember(firstOrganization.slug, second.userId)).toBeNull();
    expect((await repository.workspaceOverview(first.organizationId, first.userId))?.wallets.map((wallet) => wallet.id)).toContain(first.walletId);
    expect(await repository.workspaceOverview(first.organizationId, second.userId)).toBeNull();
    expect((await repository.decisionsForMember({ organizationId: first.organizationId, userId: first.userId, limit: 1 }))?.decisions.length).toBe(0);
    expect(await repository.decisionsForMember({ organizationId: first.organizationId, userId: second.userId })).toBeNull();
    expect(await repository.decisionForMember(first.organizationId, second.userId, crypto.randomUUID())).toBeNull();

    await value.db.update(organizations).set({ status: "archived" }).where(eq(organizations.id, first.organizationId));
    expect(await repository.organizationForMember(first.organizationId, first.userId)).toBeNull();
    expect(await repository.walletForMember(first.organizationId, first.userId, first.walletId)).toBeNull();
    expect(await repository.agentForMember(first.organizationId, first.userId, first.agentId)).toBeNull();
    expect(await repository.assignmentForMember(first.organizationId, first.userId, first.assignmentId)).toBeNull();
    await cleanupFixture(value.db, first);
    await cleanupFixture(value.db, second);
  });

  test("prevents enrolling the same network wallet address in two organizations", async () => {
    const value = openDb();
    connections.push(value);
    const first = await createFixture(value.db, crypto.randomUUID().slice(0, 8));
    const second = await createFixture(value.db, crypto.randomUUID().slice(0, 8));
    const [wallet] = await value.db.select({ suiAddress: wallets.suiAddress }).from(wallets).where(and(eq(wallets.id, first.walletId), eq(wallets.organizationId, first.organizationId)));
    await expectPostgresCode(value.db.insert(wallets).values({
      organizationId: second.organizationId,
      label: "duplicate network wallet",
      suiAddress: wallet!.suiAddress,
      adapterRef: "env:DUPLICATE",
    }), "23505");
    await cleanupFixture(value.db, first);
    await cleanupFixture(value.db, second);
  });

  test("performs owner mutations with tenant checks and same-transaction audits", async () => {
    const value = openDb();
    connections.push(value);
    const first = await createFixture(value.db, crypto.randomUUID().slice(0, 8));
    const second = await createFixture(value.db, crypto.randomUUID().slice(0, 8));
    const repository = new WorkspaceRepository(value.db);

    const registered = await repository.registerWallet({
      organizationId: first.organizationId,
      actorId: first.userId,
      label: "Secondary disabled wallet",
      suiAddress: address("9"),
    });
    expect(registered.wallet.executionStatus).toBe("disabled");
    expect(registered.policyScope.walletId).toBe(registered.wallet.id);

    const policies = new PolicyRepository(value.db);
    const draft = await policies.createDraft({ organizationId: first.organizationId, scopeId: registered.policyScope.id, createdByUserId: first.userId, maxPerTxMist: "10", maxPerDayMist: "20", maxPerMonthMist: "30", blockRiskScoreAt: 80, requireSimulation: true });
    await policies.activate({ organizationId: first.organizationId, scopeId: registered.policyScope.id, versionId: draft.id, actorId: first.userId });
    const agent = await repository.createAgent({ organizationId: first.organizationId, actorId: first.userId, name: "Mutation agent", externalRef: `mutation-${crypto.randomUUID()}` });
    const created = await repository.createAssignment({ organizationId: first.organizationId, actorId: first.userId, walletId: registered.wallet.id, agentId: agent.id });
    expect(created.assignment.status).toBe("disabled");
    expect(created.policyDraft.policyHash).toBe(draft.policyHash);
    await policies.activate({ organizationId: first.organizationId, scopeId: created.policyScope.id, versionId: created.policyDraft.id, actorId: first.userId });
    expect((await repository.setAssignmentStatus({ organizationId: first.organizationId, actorId: first.userId, assignmentId: created.assignment.id, status: "active" })).status).toBe("active");

    const credential = await repository.issueCredential({ organizationId: first.organizationId, actorId: first.userId, assignmentId: created.assignment.id, name: "Runtime", tokenPrefix: crypto.randomUUID().replaceAll("-", "").slice(0, 12), tokenHash: Buffer.from(crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"), "hex") });
    expect(credential.tokenHash).toBeInstanceOf(Buffer);
    expect((await repository.revokeCredential({ organizationId: first.organizationId, actorId: first.userId, credentialId: credential.id })).revokedAt).not.toBeNull();

    await expect(repository.setAgentStatus({ organizationId: first.organizationId, actorId: second.userId, agentId: agent.id, status: "disabled" })).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
    await expect(repository.setWalletStatus({ organizationId: second.organizationId, actorId: second.userId, walletId: registered.wallet.id, status: "suspended" })).rejects.toMatchObject({ code: "WALLET_NOT_FOUND" });
    const mutationAudits = await value.db.select().from(auditEvents).where(and(eq(auditEvents.organizationId, first.organizationId), eq(auditEvents.subjectId, credential.id)));
    expect(mutationAudits.map((event) => event.eventType)).toEqual(["credential_issued", "credential_revoked"]);

    await value.db.delete(agentCredentials).where(eq(agentCredentials.id, credential.id));
    expect((await value.db.select().from(policyScopes).where(and(eq(policyScopes.organizationId, first.organizationId), eq(policyScopes.assignmentId, created.assignment.id)))).length).toBe(1);
  });
});
