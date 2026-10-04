import "server-only";
import { createHash } from "node:crypto";
import { makeSuiClient, readSuiClock, readVaultGrant, readVaultState } from "@allen-saji/praxis";
import { hashCanonical, toCanonicalPolicy, type PolicyInput } from "@allen-saji/praxis-db";
import { HttpError, policyRepository, workspaceRepository } from "./control-plane.server";
import { vaultPackageId } from "./vault-config.server";
import { vaultDelegateAddress } from "./vault-signer.server";

/** Mirror owner-approved chain limits before enabling the hosted assignment.
 * Chain authorization is checked again by simulation and by Move at execution. */
export async function activateVaultAssignment(input: { organizationId: string; actorId: string; assignmentId: string }) {
  if (process.env.PRAXIS_VAULT_EXECUTION_ENABLED !== "true") throw new HttpError(503, "VAULT_EXECUTION_PENDING", "Hosted vault execution is not enabled on this deployment.");
  const workspaces = workspaceRepository();
  const row = await workspaces.assignmentExecutionForMember(input.organizationId, input.actorId, input.assignmentId);
  if (!row || row.member.role !== "owner" || row.assignment.status === "archived" || row.agent.status !== "active") throw new HttpError(404, "ASSIGNMENT_NOT_FOUND", "Active agent access was not found.");
  const packageId = vaultPackageId();
  if (row.wallet.adapterType !== "delegated_vault" || row.wallet.vaultPackageId !== packageId) throw new HttpError(400, "VAULT_REQUIRED", "This assignment does not use the configured vault package.");
  const client = makeSuiClient("testnet");
  const state = await readVaultState(client, { packageId, vaultId: row.wallet.suiAddress });
  if (state.owner !== row.wallet.vaultOwnerAddress || state.paused) throw new HttpError(409, "VAULT_NOT_READY", "Vault ownership or pause state prevents activation.");
  const agent = `0x${createHash("sha256").update(row.agent.id).digest("hex")}`;
  const grant = await readVaultGrant(client, packageId, state, agent);
  if (!grant.active || BigInt(grant.expires_ms) <= await readSuiClock(client)) throw new HttpError(409, "GRANT_NOT_ACTIVE", "Approve an active, unexpired agent grant in your wallet first.");
  if (!grant.recipients.some((recipient) => state.recipients.includes(recipient))) throw new HttpError(409, "NO_SHARED_RECIPIENT", "The agent and vault need at least one allowed recipient in common.");
  const delegate = await vaultDelegateAddress({ organizationId: input.organizationId, assignmentId: input.assignmentId, packageId, vaultId: row.wallet.suiAddress, agent });
  if (delegate !== grant.delegate) throw new HttpError(409, "DELEGATE_MISMATCH", "The on-chain delegate does not match the configured signer.");
  const balance = await client.getBalance({ owner: delegate, coinType: "0x2::sui::SUI" });
  const gasCap = process.env.PRAXIS_VAULT_MAX_GAS_MIST;
  if (!gasCap || !/^[1-9][0-9]{0,19}$/.test(gasCap) || BigInt(balance.balance.balance) < BigInt(gasCap)) throw new HttpError(409, "DELEGATE_GAS_REQUIRED", "The delegate needs Testnet SUI for transaction gas before activation.");
  const overview = await workspaces.workspaceOverview(input.organizationId, input.actorId);
  if (!overview) throw new HttpError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found.");
  const policies = policyRepository();
  async function mirror(scopeId: string | undefined, source: typeof state | typeof grant) {
    if (!scopeId) throw new Error("Vault policy scope is missing");
    const document: PolicyInput = { organizationId: input.organizationId, createdByUserId: input.actorId, scopeId, maxPerTxMist: BigInt(source.per_payment) < BigInt(source.budget.daily_limit) ? source.per_payment : source.budget.daily_limit, maxPerDayMist: source.budget.daily_limit, maxPerMonthMist: source.budget.monthly_limit, blockRiskScoreAt: 80, requireSimulation: true, rules: source.recipients.map((recipient) => ({ recipient, effect: "allow" as const })) };
    const active = await policies.active(scopeId, input.organizationId);
    if (active?.version.policyHash === hashCanonical(toCanonicalPolicy(document))) return;
    const draft = await policies.createDraft(document);
    await policies.activate({ organizationId: input.organizationId, actorId: input.actorId, scopeId, versionId: draft.id });
  }
  await mirror(overview.scopes.find((scope) => scope.scopeType === "wallet" && scope.walletId === row.wallet.id)?.id, state);
  await mirror(overview.scopes.find((scope) => scope.assignmentId === row.assignment.id)?.id, grant);
  await workspaces.setWalletStatus({ organizationId: input.organizationId, actorId: input.actorId, walletId: row.wallet.id, status: "enabled" });
  await workspaces.setAssignmentStatus({ ...input, status: "active" });
  return { active: true, delegate, grantVersion: grant.version, vaultVersion: state.version };
}
