import { z } from "zod";
import { makeSuiClient, readVaultState } from "@allen-saji/praxis";
import { normalizeSuiAddress, isValidSuiAddress } from "@mysten/sui/utils";
import { HttpError, requireOrganizationMember, requireSameOrigin, safeErrorResponse } from "@/lib/control-plane.server";
import { readJsonBody, workspaceRepository } from "@/lib/workspace-mutations.server";
import { vaultPackageId } from "@/lib/vault-config.server";
const bodySchema = z.union([
  z.object({ label: z.string().trim().min(1).max(64), vaultId: z.string().refine(isValidSuiAddress) }).strict(),
  z.object({ label: z.string().trim().min(1).max(64), transactionDigest: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,64}$/) }).strict(),
]);

export async function POST(request: Request, context: { params: Promise<{ orgId: string }> }) {
  try {
    requireSameOrigin(request);
    const { orgId } = await context.params;
    const membership = await requireOrganizationMember(request, orgId, "owner");
    const body = await readJsonBody(request, (value) => bodySchema.parse(value));
    const packageId = vaultPackageId();
    const client = makeSuiClient("testnet");
    let vaultId: string;
    if ("vaultId" in body) vaultId = normalizeSuiAddress(body.vaultId);
    else {
      const response = await client.getTransaction({ digest: body.transactionDigest, include: { effects: true, objectTypes: true } });
      if (response.$kind !== "Transaction" || !response.Transaction.status.success || response.Transaction.digest !== body.transactionDigest) throw new HttpError(409, "VAULT_NOT_CONFIRMED", "Vault creation is not confirmed. Retry registration without creating another vault.");
      const transaction = response.Transaction;
      const created = transaction.effects?.changedObjects.filter((item) => item.idOperation === "Created" && transaction.objectTypes?.[item.objectId] === `${packageId}::vault::Vault`) ?? [];
      if (created.length !== 1) throw new HttpError(400, "VAULT_NOT_FOUND", "Transaction must create exactly one Praxis vault.");
      vaultId = created[0]!.objectId;
    }
    const state = await readVaultState(client, { packageId, vaultId });
    if (state.owner !== normalizeSuiAddress(membership.session.user.primarySuiAddress)) throw new HttpError(403, "VAULT_OWNER_MISMATCH", "The connected account does not own this vault.");
    const result = await workspaceRepository().registerVault({ organizationId: orgId, actorId: membership.session.user.id, label: body.label, vaultId, ownerAddress: state.owner, packageId });
    return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeErrorResponse(error, "VAULT_REGISTRATION_FAILED", 400); }
}
