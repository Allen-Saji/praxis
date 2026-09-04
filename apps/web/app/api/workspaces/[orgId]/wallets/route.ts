import { z } from "zod";
import { ownerMutation, readJsonBody, workspaceRepository } from "@/lib/workspace-mutations.server";

const bodySchema = z.object({ label: z.string().trim().min(1).max(64), suiAddress: z.string().min(1), network: z.literal("testnet"), adapterType: z.literal("demo_keypair").optional() }).strict();

export async function POST(request: Request, context: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await context.params;
  return ownerMutation(request, orgId, async (actorId) => {
    const body = await readJsonBody(request, (value) => bodySchema.parse(value));
    return workspaceRepository().registerWallet({ organizationId: orgId, actorId, label: body.label, suiAddress: body.suiAddress });
  });
}
