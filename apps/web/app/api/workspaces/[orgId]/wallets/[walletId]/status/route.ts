import { HttpError } from "@/lib/control-plane.server";
import { z } from "zod";
import { assertWalletEnablement, ownerMutation, readJsonBody, workspaceRepository } from "@/lib/workspace-mutations.server";

const bodySchema = z.object({ status: z.enum(["disabled", "enabled", "suspended"]) }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ orgId: string; walletId: string }> }) {
  const { orgId, walletId } = await context.params;
  return ownerMutation(request, orgId, async (actorId) => {
    const body = await readJsonBody(request, (value) => bodySchema.parse(value));
    if (body.status === "enabled") {
      const existing = await workspaceRepository().walletForMember(orgId, actorId, walletId);
      if (!existing) throw new Error("Wallet was not found");
      if (existing.wallet.adapterType === "delegated_vault") throw new HttpError(503, "VAULT_EXECUTION_PENDING", "Hosted vault execution is not enabled yet.");
      await assertWalletEnablement(existing.wallet.suiAddress);
    }
    return { wallet: await workspaceRepository().setWalletStatus({ organizationId: orgId, actorId, walletId, status: body.status }) };
  });
}
