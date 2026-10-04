import { createHash } from "node:crypto";
import { makeSuiClient, readVaultState } from "@allen-saji/praxis";
import { ownerMutation, workspaceRepository } from "@/lib/workspace-mutations.server";
import { HttpError } from "@/lib/control-plane.server";
import { provisionVaultDelegate } from "@/lib/vault-signer.server";
import { vaultPackageId } from "@/lib/vault-config.server";

export async function POST(request: Request, context: { params: Promise<{ orgId: string; assignmentId: string }> }) {
  const { orgId, assignmentId } = await context.params;
  return ownerMutation(request, orgId, async (actorId) => {
    const row = await workspaceRepository().assignmentExecutionForMember(orgId, actorId, assignmentId);
    if (!row || row.assignment.status === "archived" || row.agent.status === "archived") throw new HttpError(404, "ASSIGNMENT_NOT_FOUND", "Agent access was not found.");
    const packageId = vaultPackageId();
    if (row.wallet.adapterType !== "delegated_vault" || row.wallet.vaultPackageId !== packageId) throw new HttpError(400, "VAULT_REQUIRED", "This assignment does not use a supported vault.");
    const state = await readVaultState(makeSuiClient("testnet"), { packageId, vaultId: row.wallet.suiAddress });
    if (state.owner !== row.wallet.vaultOwnerAddress) throw new HttpError(409, "VAULT_OWNER_MISMATCH", "Vault owner no longer matches its registration.");
    const agent = `0x${createHash("sha256").update(row.assignment.agentId).digest("hex")}`;
    const delegate = await provisionVaultDelegate({ organizationId: orgId, assignmentId, packageId, vaultId: row.wallet.suiAddress, agent });
    return { delegate, agent, vaultId: row.wallet.suiAddress, packageId, network: "testnet", spendingAuthorized: false };
  });
}
