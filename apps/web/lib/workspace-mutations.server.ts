import "server-only";
import { createAgentCredential, tokenDigest } from "@allen-saji/praxis-control-plane";
import { DEPLOYMENTS, makeSuiClient } from "@allen-saji/praxis";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { HttpError, policyRepository, readJsonBody, requireOrganizationMember, requireSameOrigin, requiredSecret, safeErrorResponse, workspaceRepository } from "./control-plane.server";

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
  if ((process.env.PRAXIS_NETWORK ?? "testnet") !== "testnet") throw new HttpError(503, "EXECUTION_UNAVAILABLE", "Hosted payments require the Testnet execution configuration.");
  const key = process.env.PRAXIS_OPERATOR_KEY;
  if (!key) throw new HttpError(503, "EXECUTION_UNAVAILABLE", "Hosted payments are not configured. The operator must configure the Testnet signer first.");
  const expected = normalizeSuiAddress(address);
  let signerAddress: string;
  try { signerAddress = normalizeSuiAddress(Ed25519Keypair.fromSecretKey(key).toSuiAddress()); }
  catch { throw new HttpError(503, "EXECUTION_UNAVAILABLE", "The hosted Testnet signer configuration is invalid."); }
  if (expected !== signerAddress) throw new HttpError(403, "WALLET_NOT_SUPPORTED", "This wallet is not the configured Testnet execution wallet.");
  let result: unknown;
  try { result = await makeSuiClient("testnet").getObject({ objectId: DEPLOYMENTS.testnet.agentCapId }); }
  catch { throw new HttpError(503, "ELIGIBILITY_UNAVAILABLE", "Wallet authority could not be checked. Please retry shortly."); }
  const owner = findAddressOwner(result);
  if (!owner || normalizeSuiAddress(owner) !== signerAddress) throw new HttpError(503, "EXECUTION_AUTHORITY_UNAVAILABLE", "The configured wallet does not hold the required Praxis execution authority.");
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

/** Vault limits are approved by the owner on chain and mirrored during activation. */
export async function assertEditablePolicyScope(organizationId: string, actorId: string, scopeId: string) {
  const overview = await workspaceRepository().workspaceOverview(organizationId, actorId);
  const scope = overview?.scopes.find((item) => item.id === scopeId);
  if (!overview || !scope) throw new HttpError(404, "POLICY_SCOPE_NOT_FOUND", "Policy scope was not found.");
  const walletId = scope.walletId ?? overview.assignments.find((item) => item.id === scope.assignmentId)?.walletId;
  if (overview.wallets.find((item) => item.id === walletId)?.adapterType === "delegated_vault") throw new HttpError(409, "VAULT_POLICY_REQUIRES_WALLET", "Approve vault limits with your wallet, then activate agent access to sync them.");
}
