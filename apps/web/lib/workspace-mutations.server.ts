import "server-only";
import { createAgentCredential, tokenDigest } from "@allen-saji/praxis-control-plane";
import { DEPLOYMENTS, makeSuiClient } from "@allen-saji/praxis";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { policyRepository, readJsonBody, requireOrganizationMember, requireSameOrigin, requiredSecret, safeErrorResponse, workspaceRepository } from "./control-plane.server";

export async function ownerMutation<T>(request: Request, organizationId: string, action: (actorId: string) => Promise<T>): Promise<Response> {
  try {
    requireSameOrigin(request);
    const context = await requireOrganizationMember(request, organizationId, "owner");
    const result = await action(context.session.user.id);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error, "WORKSPACE_MUTATION_FAILED", 400);
  }
}

export { readJsonBody, policyRepository, workspaceRepository };

export async function issueCredential(input: { organizationId: string; actorId: string; assignmentId: string; name: string; expiresAt?: Date | null }) {
  const generated = createAgentCredential();
  const digest = tokenDigest(generated.token, requiredSecret("PRAXIS_CREDENTIAL_PEPPER"));
  const credential = await workspaceRepository().issueCredential({ ...input, tokenPrefix: generated.prefix, tokenHash: Buffer.from(digest, "hex") });
  return { credential: safeCredential(credential), token: generated.token };
}

export function safeCredential(credential: { id: string; assignmentId: string; name: string; tokenPrefix: string; createdAt: Date; expiresAt: Date | null; revokedAt: Date | null }) {
  return { id: credential.id, assignmentId: credential.assignmentId, name: credential.name, tokenPrefix: credential.tokenPrefix, createdAt: credential.createdAt, expiresAt: credential.expiresAt, revokedAt: credential.revokedAt };
}

export async function assertWalletEnablement(address: string): Promise<void> {
  if ((process.env.PRAXIS_NETWORK ?? "testnet") !== "testnet") throw new Error("Hosted execution supports Testnet only");
  const key = process.env.PRAXIS_OPERATOR_KEY;
  if (!key) throw new Error("PRAXIS_OPERATOR_KEY is not configured");
  const expected = normalizeSuiAddress(address);
  const signerAddress = normalizeSuiAddress(Ed25519Keypair.fromSecretKey(key).toSuiAddress());
  if (expected !== signerAddress) throw new Error("Configured signer does not own this wallet");
  const result = await makeSuiClient("testnet").getObject({ objectId: DEPLOYMENTS.testnet.agentCapId });
  const owner = findAddressOwner(result);
  if (!owner || normalizeSuiAddress(owner) !== signerAddress) throw new Error("Configured AgentCap is not owned by this wallet");
}

function findAddressOwner(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const direct = object.AddressOwner ?? object.addressOwner;
  if (typeof direct === "string") return direct;
  for (const key of ["owner", "object", "data", "response"]) {
    const nested = findAddressOwner(object[key]);
    if (nested) return nested;
  }
  return null;
}
