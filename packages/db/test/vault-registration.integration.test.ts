import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { WorkspaceRepository } from "../src/repositories/workspaces";
import { users } from "../src/schema";
import { address, createFixture, databaseUrl, openDb } from "./support";
const test = databaseUrl ? it : it.skip;
const connections: ReturnType<typeof openDb>[] = [];
afterAll(async () => { await Promise.all(connections.map(({ client }) => client.end())); });

describe("vault registration", () => {
  test("binds the verified owner and retries without creating another wallet", async () => {
    const connection = openDb(); connections.push(connection);
    const f = await createFixture(connection.db);
    const [owner] = await connection.db.select().from(users).where(eq(users.id, f.userId));
    const repository = new WorkspaceRepository(connection.db);
    const input = { organizationId: f.organizationId, actorId: f.userId, label: "Owned vault", vaultId: address("8", crypto.randomUUID().slice(0, 8)), ownerAddress: owner!.primarySuiAddress, packageId: address("9") };
    const first = await repository.registerVault(input);
    expect(first.wallet.executionStatus).toBe("disabled");
    expect(first.wallet.adapterType).toBe("delegated_vault");
    expect(first.wallet.vaultOwnerAddress).toBe(input.ownerAddress);
    expect((await repository.registerVault(input)).wallet.id).toBe(first.wallet.id);
    await expect(repository.registerVault({ ...input, ownerAddress: address("7") })).rejects.toMatchObject({ code: "VAULT_OWNER_MISMATCH" });
    const other = await createFixture(connection.db);
    await expect(repository.registerVault({ ...input, organizationId: other.organizationId })).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
  });
});
