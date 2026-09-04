import { and, eq } from "drizzle-orm";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { makeSuiClient, DEPLOYMENTS } from "@allen-saji/praxis";
import { parseAgentCredential, tokenDigest } from "@allen-saji/praxis-control-plane";
import { createDb, users, organizationMembers, WorkspaceRepository, PolicyRepository, hashCanonical, toCanonicalPolicy, type PolicyRule } from "@allen-saji/praxis-db";

const databaseUrl = required("DATABASE_URL");
const ownerAddress = normalizeSuiAddress(required("PRAXIS_PHASE1_OWNER_ADDRESS"));
const walletAddress = normalizeSuiAddress(required("PRAXIS_PHASE1_WALLET_ADDRESS"));
const vendorAddress = normalizeSuiAddress(required("PRAXIS_PHASE1_VENDOR_ADDRESS"));
const deniedAddress = normalizeSuiAddress(required("PRAXIS_PHASE1_DENIED_ADDRESS"));
const pepper = required("PRAXIS_CREDENTIAL_PEPPER");
const tokens = {
  research: required("PRAXIS_PHASE1_RESEARCH_TOKEN"),
  trading: required("PRAXIS_PHASE1_TRADING_TOKEN"),
  injected: required("PRAXIS_PHASE1_INJECTED_TOKEN"),
};
for (const token of Object.values(tokens)) parseAgentCredential(token);

const connection = createDb(databaseUrl);
const workspaces = new WorkspaceRepository(connection.db);
const policies = new PolicyRepository(connection.db);

try {
  await connection.db.insert(users).values({ primarySuiAddress: ownerAddress }).onConflictDoNothing({ target: users.primarySuiAddress });
  const [owner] = await connection.db.select().from(users).where(eq(users.primarySuiAddress, ownerAddress)).limit(1);
  if (!owner) throw new Error("owner could not be created");

  let membership = await workspaces.organizationBySlugForMember("praxis-labs", owner.id);
  if (!membership) {
    const organization = await workspaces.createOrganization({ slug: "praxis-labs", name: "Praxis Labs", userId: owner.id });
    membership = await workspaces.organizationForMember(organization.id, owner.id);
  }
  if (!membership) throw new Error("praxis-labs exists but is not owned by the configured owner address");
  const organizationId = membership.organization.id;
  const foreignMembership = await connection.db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, owner.id))).limit(1);
  if (!foreignMembership.length) throw new Error("configured owner is not a member of praxis-labs");

  let overview = await requiredOverview(organizationId, owner.id);
  let wallet = overview.wallets.find((value) => value.suiAddress === walletAddress);
  if (!wallet) {
    if (overview.wallets.length) throw new Error("praxis-labs already contains a different Phase 1 wallet");
    wallet = (await workspaces.registerWallet({ organizationId, actorId: owner.id, label: "Operations Treasury", suiAddress: walletAddress })).wallet;
  }
  const walletScope = (await requiredOverview(organizationId, owner.id)).scopes.find((scope) => scope.walletId === wallet!.id);
  if (!walletScope) throw new Error("wallet policy scope is missing");
  await ensureActivePolicy(organizationId, owner.id, walletScope.id, {
    maxPerTxMist: "50000000", maxPerDayMist: "100000000", maxPerMonthMist: "1000000000", blockRiskScoreAt: 80, requireSimulation: true, rules: [{ recipient: vendorAddress, effect: "allow" }],
  });

  const definitions = [
    { key: "research" as const, name: "Research Agent", externalRef: "research-agent", policy: { maxPerTxMist: "10000000", maxPerDayMist: "30000000", maxPerMonthMist: "200000000", blockRiskScoreAt: 80, requireSimulation: true as const, rules: [{ recipient: vendorAddress, effect: "allow" as const }] } },
    { key: "trading" as const, name: "Trading Agent", externalRef: "trading-agent", policy: { maxPerTxMist: "20000000", maxPerDayMist: "50000000", maxPerMonthMist: "400000000", blockRiskScoreAt: 80, requireSimulation: true as const, rules: [{ recipient: vendorAddress, effect: "allow" as const }] } },
    { key: "injected" as const, name: "Injected Agent", externalRef: "injected-agent", policy: { maxPerTxMist: "50000000", maxPerDayMist: "100000000", maxPerMonthMist: "1000000000", blockRiskScoreAt: 80, requireSimulation: true as const, rules: [{ recipient: deniedAddress, effect: "deny" as const }] } },
  ];

  for (const definition of definitions) {
    overview = await requiredOverview(organizationId, owner.id);
    const agent = overview.agents.find((value) => value.externalRef === definition.externalRef)
      ?? await workspaces.createAgent({ organizationId, actorId: owner.id, name: definition.name, externalRef: definition.externalRef });
    overview = await requiredOverview(organizationId, owner.id);
    let assignment = overview.assignments.find((value) => value.walletId === wallet!.id && value.agentId === agent.id);
    if (!assignment) assignment = (await workspaces.createAssignment({ organizationId, actorId: owner.id, walletId: wallet.id, agentId: agent.id })).assignment;
    const scope = (await requiredOverview(organizationId, owner.id)).scopes.find((value) => value.assignmentId === assignment!.id);
    if (!scope) throw new Error(`policy scope missing for ${definition.name}`);
    await ensureActivePolicy(organizationId, owner.id, scope.id, definition.policy);
    if (assignment.status !== "active") assignment = await workspaces.setAssignmentStatus({ organizationId, actorId: owner.id, assignmentId: assignment.id, status: "active" });
    overview = await requiredOverview(organizationId, owner.id);
    const { prefix } = parseAgentCredential(tokens[definition.key]);
    const existing = overview.credentials.find((value) => value.assignmentId === assignment!.id && value.tokenPrefix === prefix);
    if (!existing) await workspaces.issueCredential({ organizationId, actorId: owner.id, assignmentId: assignment.id, name: "Phase 1 demo", tokenPrefix: prefix, tokenHash: Buffer.from(tokenDigest(tokens[definition.key], pepper), "hex") });
  }

  if (process.env.PRAXIS_LIVE_TESTNET_CONFIRM === "YES") {
    await verifyExecutableWallet(walletAddress);
    if (wallet.executionStatus !== "enabled") wallet = await workspaces.setWalletStatus({ organizationId, actorId: owner.id, walletId: wallet.id, status: "enabled" });
  }
  overview = await requiredOverview(organizationId, owner.id);
  console.log(JSON.stringify({ organizationId, slug: membership.organization.slug, walletId: wallet.id, walletStatus: wallet.executionStatus, agents: overview.agents.length, assignments: overview.assignments.length, activePolicies: overview.policyVersions.filter((value) => value.version.status === "active").length, activeCredentials: overview.credentials.filter((value) => !value.revokedAt).length, liveVerification: process.env.PRAXIS_LIVE_TESTNET_CONFIRM === "YES" }, null, 2));
} finally {
  await connection.client.end();
}

type PolicyDefinition = { maxPerTxMist: string; maxPerDayMist: string; maxPerMonthMist: string; blockRiskScoreAt: number; requireSimulation: true; rules: readonly PolicyRule[] };
async function ensureActivePolicy(organizationId: string, actorId: string, scopeId: string, definition: PolicyDefinition) {
  const desiredHash = hashCanonical(toCanonicalPolicy(definition));
  let overview = await requiredOverview(organizationId, actorId);
  let versions = overview.policyVersions.filter((value) => value.scope.id === scopeId).map((value) => value.version);
  if (versions.find((value) => value.status === "active")?.policyHash === desiredHash) return;
  if (!versions.some((value) => value.status === "active")) {
    const bootstrap = versions.find((value) => value.status === "draft");
    if (bootstrap) await policies.activate({ organizationId, scopeId, versionId: bootstrap.id, actorId });
  }
  overview = await requiredOverview(organizationId, actorId);
  versions = overview.policyVersions.filter((value) => value.scope.id === scopeId).map((value) => value.version);
  const matching = versions.find((value) => value.policyHash === desiredHash);
  if (matching?.status === "active") return;
  if (matching?.status === "superseded") throw new Error(`policy ${desiredHash} is superseded and cannot be reactivated`);
  const draft = matching ?? await policies.createDraft({ organizationId, scopeId, createdByUserId: actorId, ...definition });
  await policies.activate({ organizationId, scopeId, versionId: draft.id, actorId });
}
async function requiredOverview(organizationId: string, userId: string) { const value = await workspaces.workspaceOverview(organizationId, userId); if (!value) throw new Error("workspace not found"); return value; }
async function verifyExecutableWallet(address: string) {
  const key = required("PRAXIS_OPERATOR_KEY");
  const signerAddress = normalizeSuiAddress(Ed25519Keypair.fromSecretKey(key).toSuiAddress());
  if (signerAddress !== address) throw new Error("configured operator key does not match the Phase 1 wallet");
  const result = await makeSuiClient("testnet").getObject({ objectId: DEPLOYMENTS.testnet.agentCapId });
  const owner = findAddressOwner(result);
  if (!owner || normalizeSuiAddress(owner) !== signerAddress) throw new Error("configured AgentCap is not owned by the Phase 1 wallet");
}
function findAddressOwner(value: unknown): string | null { if (!value || typeof value !== "object") return null; const object = value as Record<string, unknown>; const direct = object.AddressOwner ?? object.addressOwner; if (typeof direct === "string") return direct; for (const key of ["owner", "object", "data", "response"]) { const nested = findAddressOwner(object[key]); if (nested) return nested; } return null; }
function required(name: string) { const value = process.env[name]; if (!value || value.startsWith("replace-with-")) throw new Error(`${name} is required`); return value; }
