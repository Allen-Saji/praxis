import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { appendAuditEvent } from "./audit";
import { DbDomainError } from "../errors";

type Db = PostgresJsDatabase<typeof schema>;
type Role = "owner" | "admin" | "viewer";
const ROLE_LEVEL: Record<Role, number> = { viewer: 0, admin: 1, owner: 2 };

export class WorkspaceRepository {
  constructor(private readonly db: Db) {}
  async createOrganization(input: { slug: string; name: string; userId: string }) {
    return this.db.transaction(async (tx) => { const [organization] = await tx.insert(schema.organizations).values({ slug: input.slug, name: input.name }).returning(); if (!organization) throw new Error("organization creation failed"); await tx.insert(schema.organizationMembers).values({ organizationId: organization.id, userId: input.userId, role: "owner" }); await appendAuditEvent(tx, { organizationId: organization.id, actorType: "user", actorId: input.userId, eventType: "workspace_created", subjectType: "organization", subjectId: organization.id, metadataJson: {} }); return organization; });
  }
  async member(organizationId: string, userId: string) { const [member] = await this.db.select({ member: schema.organizationMembers }).from(schema.organizationMembers).innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMembers.organizationId)).where(and(eq(schema.organizationMembers.organizationId, organizationId), eq(schema.organizationMembers.userId, userId), eq(schema.organizations.status, "active"))).limit(1); return member?.member ?? null; }

  private async requireRole(tx: Db, organizationId: string, userId: string, minimum: Role = "owner") {
    const [row] = await tx.select({ member: schema.organizationMembers }).from(schema.organizationMembers)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMembers.organizationId))
      .where(and(eq(schema.organizationMembers.organizationId, organizationId), eq(schema.organizationMembers.userId, userId), eq(schema.organizations.status, "active"))).limit(1);
    const role = row?.member.role as Role | undefined;
    if (!row || !role || ROLE_LEVEL[role] < ROLE_LEVEL[minimum]) throw new DbDomainError("WORKSPACE_NOT_FOUND", "workspace was not found");
    return row.member;
  }

  async registerWallet(input: { organizationId: string; actorId: string; label: string; suiAddress: string; adapterRef?: string }) {
    const address = normalizeAddress(input.suiAddress);
    return this.db.transaction(async (tx) => {
      await this.requireRole(tx as Db, input.organizationId, input.actorId);
      const [wallet] = await tx.insert(schema.wallets).values({ organizationId: input.organizationId, label: input.label.trim(), suiAddress: address, adapterRef: input.adapterRef ?? "env:PRAXIS_OPERATOR_KEY" }).returning();
      if (!wallet) throw new DbDomainError("WALLET_CREATE_FAILED", "wallet was not created");
      const [scope] = await tx.insert(schema.policyScopes).values({ organizationId: input.organizationId, scopeType: "wallet", walletId: wallet.id }).returning();
      if (!scope) throw new DbDomainError("POLICY_SCOPE_CREATE_FAILED", "wallet policy scope was not created");
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.actorId, eventType: "wallet_registered", subjectType: "wallet", subjectId: wallet.id, metadataJson: { walletId: wallet.id, scopeId: scope.id } });
      return { wallet, policyScope: scope };
    });
  }

  async setWalletStatus(input: { organizationId: string; actorId: string; walletId: string; status: "disabled" | "enabled" | "suspended" }) {
    return this.db.transaction(async (tx) => {
      await this.requireRole(tx as Db, input.organizationId, input.actorId);
      const [wallet] = await tx.update(schema.wallets).set({ executionStatus: input.status, updatedAt: new Date() }).where(and(eq(schema.wallets.organizationId, input.organizationId), eq(schema.wallets.id, input.walletId), isNull(schema.wallets.archivedAt))).returning();
      if (!wallet) throw new DbDomainError("WALLET_NOT_FOUND", "wallet was not found");
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.actorId, eventType: `wallet_${input.status}`, subjectType: "wallet", subjectId: wallet.id, metadataJson: { walletId: wallet.id, state: input.status } });
      return wallet;
    });
  }

  async createAgent(input: { organizationId: string; actorId: string; name: string; externalRef: string }) {
    return this.db.transaction(async (tx) => {
      await this.requireRole(tx as Db, input.organizationId, input.actorId);
      const [agent] = await tx.insert(schema.agents).values({ organizationId: input.organizationId, name: input.name.trim(), externalRef: input.externalRef.trim(), status: "active" }).returning();
      if (!agent) throw new DbDomainError("AGENT_CREATE_FAILED", "agent was not created");
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.actorId, eventType: "agent_created", subjectType: "agent", subjectId: agent.id, metadataJson: { state: agent.status } });
      return agent;
    });
  }

  async setAgentStatus(input: { organizationId: string; actorId: string; agentId: string; status: "active" | "disabled" | "archived" }) {
    return this.db.transaction(async (tx) => {
      await this.requireRole(tx as Db, input.organizationId, input.actorId);
      const [agent] = await tx.update(schema.agents).set({ status: input.status, updatedAt: new Date() }).where(and(eq(schema.agents.organizationId, input.organizationId), eq(schema.agents.id, input.agentId))).returning();
      if (!agent) throw new DbDomainError("AGENT_NOT_FOUND", "agent was not found");
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.actorId, eventType: `agent_${input.status}`, subjectType: "agent", subjectId: agent.id, metadataJson: { state: input.status } });
      return agent;
    });
  }

  async createAssignment(input: { organizationId: string; actorId: string; walletId: string; agentId: string }) {
    return this.db.transaction(async (tx) => {
      await this.requireRole(tx as Db, input.organizationId, input.actorId);
      const [walletPolicy] = await tx.select({ version: schema.policyVersions }).from(schema.policyScopes)
        .innerJoin(schema.policyVersions, and(eq(schema.policyVersions.id, schema.policyScopes.currentVersionId), eq(schema.policyVersions.status, "active")))
        .where(and(eq(schema.policyScopes.organizationId, input.organizationId), eq(schema.policyScopes.scopeType, "wallet"), eq(schema.policyScopes.walletId, input.walletId))).limit(1);
      const [agent] = await tx.select({ id: schema.agents.id }).from(schema.agents).where(and(eq(schema.agents.organizationId, input.organizationId), eq(schema.agents.id, input.agentId), eq(schema.agents.status, "active"))).limit(1);
      if (!walletPolicy || !agent) throw new DbDomainError("ASSIGNMENT_SUBJECT_NOT_READY", "wallet policy and active agent are required");
      const [assignment] = await tx.insert(schema.assignments).values({ organizationId: input.organizationId, walletId: input.walletId, agentId: input.agentId, status: "disabled" }).returning();
      if (!assignment) throw new DbDomainError("ASSIGNMENT_CREATE_FAILED", "assignment was not created");
      const [scope] = await tx.insert(schema.policyScopes).values({ organizationId: input.organizationId, scopeType: "assignment", assignmentId: assignment.id }).returning();
      if (!scope) throw new DbDomainError("POLICY_SCOPE_CREATE_FAILED", "assignment policy scope was not created");
      const source = walletPolicy.version;
      const [draft] = await tx.insert(schema.policyVersions).values({ scopeId: scope.id, version: 1, status: "draft", maxPerTxMist: source.maxPerTxMist, maxPerDayMist: source.maxPerDayMist, maxPerMonthMist: source.maxPerMonthMist, blockRiskScoreAt: source.blockRiskScoreAt, requireSimulation: true, canonicalJson: source.canonicalJson, policyHash: source.policyHash, createdByUserId: input.actorId }).returning();
      if (!draft) throw new DbDomainError("POLICY_DRAFT_CREATE_FAILED", "assignment policy draft was not created");
      const rules = await tx.select({ recipient: schema.policyRecipientRules.recipient, effect: schema.policyRecipientRules.effect }).from(schema.policyRecipientRules).where(eq(schema.policyRecipientRules.policyVersionId, source.id));
      if (rules.length) await tx.insert(schema.policyRecipientRules).values(rules.map((rule) => ({ policyVersionId: draft.id, recipient: rule.recipient, effect: rule.effect })));
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.actorId, eventType: "assignment_created", subjectType: "assignment", subjectId: assignment.id, metadataJson: { assignmentId: assignment.id, walletId: input.walletId, scopeId: scope.id } });
      return { assignment, policyScope: scope, policyDraft: draft };
    });
  }

  async setAssignmentStatus(input: { organizationId: string; actorId: string; assignmentId: string; status: "active" | "disabled" | "archived" }) {
    return this.db.transaction(async (tx) => {
      await this.requireRole(tx as Db, input.organizationId, input.actorId);
      if (input.status === "active") {
        const [policy] = await tx.select({ id: schema.policyVersions.id }).from(schema.policyScopes).innerJoin(schema.policyVersions, and(eq(schema.policyVersions.id, schema.policyScopes.currentVersionId), eq(schema.policyVersions.status, "active"))).where(and(eq(schema.policyScopes.organizationId, input.organizationId), eq(schema.policyScopes.scopeType, "assignment"), eq(schema.policyScopes.assignmentId, input.assignmentId))).limit(1);
        if (!policy) throw new DbDomainError("NO_ACTIVE_POLICY", "assignment needs an active policy");
      }
      const [assignment] = await tx.update(schema.assignments).set({ status: input.status, updatedAt: new Date() }).where(and(eq(schema.assignments.organizationId, input.organizationId), eq(schema.assignments.id, input.assignmentId))).returning();
      if (!assignment) throw new DbDomainError("ASSIGNMENT_NOT_FOUND", "assignment was not found");
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.actorId, eventType: `assignment_${input.status}`, subjectType: "assignment", subjectId: assignment.id, metadataJson: { assignmentId: assignment.id, state: input.status } });
      return assignment;
    });
  }

  async issueCredential(input: { organizationId: string; actorId: string; assignmentId: string; name: string; tokenPrefix: string; tokenHash: Buffer; expiresAt?: Date | null }) {
    return this.db.transaction(async (tx) => {
      await this.requireRole(tx as Db, input.organizationId, input.actorId);
      const [assignment] = await tx.select({ id: schema.assignments.id }).from(schema.assignments).where(and(eq(schema.assignments.organizationId, input.organizationId), eq(schema.assignments.id, input.assignmentId), inArray(schema.assignments.status, ["active", "disabled"]))).limit(1);
      if (!assignment) throw new DbDomainError("ASSIGNMENT_NOT_FOUND", "assignment was not found");
      const [credential] = await tx.insert(schema.agentCredentials).values({ organizationId: input.organizationId, assignmentId: input.assignmentId, name: input.name.trim(), tokenPrefix: input.tokenPrefix, tokenHash: input.tokenHash, createdByUserId: input.actorId, expiresAt: input.expiresAt ?? null }).returning();
      if (!credential) throw new DbDomainError("CREDENTIAL_CREATE_FAILED", "credential was not created");
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.actorId, eventType: "credential_issued", subjectType: "credential", subjectId: credential.id, metadataJson: { assignmentId: input.assignmentId, expiresAt: credential.expiresAt?.toISOString() ?? null } });
      return credential;
    });
  }

  async revokeCredential(input: { organizationId: string; actorId: string; credentialId: string }) {
    return this.db.transaction(async (tx) => {
      await this.requireRole(tx as Db, input.organizationId, input.actorId);
      const now = new Date();
      const [credential] = await tx.update(schema.agentCredentials).set({ revokedAt: now }).where(and(eq(schema.agentCredentials.organizationId, input.organizationId), eq(schema.agentCredentials.id, input.credentialId), isNull(schema.agentCredentials.revokedAt))).returning();
      if (!credential) throw new DbDomainError("CREDENTIAL_NOT_FOUND", "credential was not found");
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.actorId, eventType: "credential_revoked", subjectType: "credential", subjectId: credential.id, metadataJson: { assignmentId: credential.assignmentId, state: "revoked" } });
      return credential;
    });
  }

  async listForUser(userId: string) {
    return this.db.select({ organization: schema.organizations, role: schema.organizationMembers.role }).from(schema.organizationMembers).innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMembers.organizationId)).where(and(eq(schema.organizationMembers.userId, userId), eq(schema.organizations.status, "active"))).orderBy(desc(schema.organizations.updatedAt));
  }

  async organizationBySlugForMember(slug: string, userId: string) {
    const [row] = await this.db.select({ organization: schema.organizations, member: schema.organizationMembers })
      .from(schema.organizations)
      .innerJoin(schema.organizationMembers, eq(schema.organizationMembers.organizationId, schema.organizations.id))
      .where(and(
        eq(schema.organizations.slug, slug),
        eq(schema.organizationMembers.userId, userId),
        eq(schema.organizations.status, "active"),
      )).limit(1);
    return row ?? null;
  }

  async workspaceOverview(organizationId: string, userId: string) {
    const membership = await this.organizationForMember(organizationId, userId);
    if (!membership) return null;
    const [wallets, agents, assignments, scopes, policyVersions, credentials, decisions, walletCounters, assignmentCounters] = await Promise.all([
      this.db.select().from(schema.wallets).where(and(eq(schema.wallets.organizationId, organizationId), isNull(schema.wallets.archivedAt))).orderBy(desc(schema.wallets.createdAt)),
      this.db.select().from(schema.agents).where(eq(schema.agents.organizationId, organizationId)).orderBy(desc(schema.agents.createdAt)),
      this.db.select().from(schema.assignments).where(eq(schema.assignments.organizationId, organizationId)).orderBy(desc(schema.assignments.createdAt)),
      this.db.select().from(schema.policyScopes).where(eq(schema.policyScopes.organizationId, organizationId)),
      this.db.select({ version: schema.policyVersions, scope: schema.policyScopes }).from(schema.policyVersions).innerJoin(schema.policyScopes, eq(schema.policyScopes.id, schema.policyVersions.scopeId)).where(eq(schema.policyScopes.organizationId, organizationId)).orderBy(desc(schema.policyVersions.version)),
      this.db.select().from(schema.agentCredentials).where(eq(schema.agentCredentials.organizationId, organizationId)).orderBy(desc(schema.agentCredentials.createdAt)),
      this.db.select().from(schema.spendIntents).where(eq(schema.spendIntents.organizationId, organizationId)).orderBy(desc(schema.spendIntents.createdAt), desc(schema.spendIntents.id)).limit(50),
      this.db.select({ counter: schema.walletBudgetCounters, wallet: schema.wallets }).from(schema.walletBudgetCounters).innerJoin(schema.wallets, eq(schema.wallets.id, schema.walletBudgetCounters.walletId)).where(eq(schema.wallets.organizationId, organizationId)),
      this.db.select({ counter: schema.assignmentBudgetCounters, assignment: schema.assignments }).from(schema.assignmentBudgetCounters).innerJoin(schema.assignments, eq(schema.assignments.id, schema.assignmentBudgetCounters.assignmentId)).where(eq(schema.assignments.organizationId, organizationId)),
    ]);
    return { ...membership, wallets, agents, assignments, scopes, policyVersions, credentials, decisions, walletCounters, assignmentCounters };
  }

  async decisionsForMember(input: { organizationId: string; userId: string; limit?: number; before?: { createdAt: Date; id: string } }) {
    const membership = await this.organizationForMember(input.organizationId, input.userId);
    if (!membership) return null;
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);
    const before = input.before
      ? or(lt(schema.spendIntents.createdAt, input.before.createdAt), and(eq(schema.spendIntents.createdAt, input.before.createdAt), lt(schema.spendIntents.id, input.before.id)))
      : undefined;
    const decisions = await this.db.select().from(schema.spendIntents).where(and(eq(schema.spendIntents.organizationId, input.organizationId), before)).orderBy(desc(schema.spendIntents.createdAt), desc(schema.spendIntents.id)).limit(limit + 1);
    return { ...membership, decisions: decisions.slice(0, limit), hasMore: decisions.length > limit };
  }

  async decisionForMember(organizationId: string, userId: string, intentId: string) {
    const membership = await this.organizationForMember(organizationId, userId);
    if (!membership) return null;
    const [decision] = await this.db.select().from(schema.spendIntents).where(and(eq(schema.spendIntents.organizationId, organizationId), eq(schema.spendIntents.id, intentId))).limit(1);
    if (!decision) return null;
    const [reservation] = await this.db.select().from(schema.budgetReservations).where(and(eq(schema.budgetReservations.organizationId, organizationId), eq(schema.budgetReservations.intentId, intentId))).limit(1);
    return { ...membership, decision, reservation: reservation ?? null };
  }

  async walletById(organizationId: string, walletId: string) {
    const [wallet] = await this.db.select().from(schema.wallets).where(and(eq(schema.wallets.organizationId, organizationId), eq(schema.wallets.id, walletId))).limit(1);
    return wallet ?? null;
  }

  async organizationForMember(organizationId: string, userId: string) {
    const [row] = await this.db.select({ organization: schema.organizations, member: schema.organizationMembers })
      .from(schema.organizations)
      .innerJoin(schema.organizationMembers, eq(schema.organizationMembers.organizationId, schema.organizations.id))
      .where(and(
        eq(schema.organizations.id, organizationId),
        eq(schema.organizationMembers.userId, userId),
        eq(schema.organizations.status, "active"),
      )).limit(1);
    return row ?? null;
  }

  async walletForMember(organizationId: string, userId: string, walletId: string) {
    const [row] = await this.db.select({ wallet: schema.wallets, member: schema.organizationMembers })
      .from(schema.wallets)
      .innerJoin(schema.organizationMembers, eq(schema.organizationMembers.organizationId, schema.wallets.organizationId))
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.wallets.organizationId))
      .where(and(
        eq(schema.wallets.id, walletId),
        eq(schema.wallets.organizationId, organizationId),
        eq(schema.organizationMembers.organizationId, organizationId),
        eq(schema.organizationMembers.userId, userId),
        eq(schema.organizations.status, "active"),
      )).limit(1);
    return row ?? null;
  }

  async agentForMember(organizationId: string, userId: string, agentId: string) {
    const [row] = await this.db.select({ agent: schema.agents, member: schema.organizationMembers })
      .from(schema.agents)
      .innerJoin(schema.organizationMembers, eq(schema.organizationMembers.organizationId, schema.agents.organizationId))
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.agents.organizationId))
      .where(and(
        eq(schema.agents.id, agentId),
        eq(schema.agents.organizationId, organizationId),
        eq(schema.organizationMembers.organizationId, organizationId),
        eq(schema.organizationMembers.userId, userId),
        eq(schema.organizations.status, "active"),
      )).limit(1);
    return row ?? null;
  }

  async assignmentForMember(organizationId: string, userId: string, assignmentId: string) {
    const [row] = await this.db.select({ assignment: schema.assignments, member: schema.organizationMembers })
      .from(schema.assignments)
      .innerJoin(schema.organizationMembers, eq(schema.organizationMembers.organizationId, schema.assignments.organizationId))
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.assignments.organizationId))
      .where(and(
        eq(schema.assignments.id, assignmentId),
        eq(schema.assignments.organizationId, organizationId),
        eq(schema.organizationMembers.organizationId, organizationId),
        eq(schema.organizationMembers.userId, userId),
        eq(schema.organizations.status, "active"),
      )).limit(1);
    return row ?? null;
  }
}

function normalizeAddress(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) throw new DbDomainError("INVALID_SUI_ADDRESS", "address is not canonical");
  return normalized;
}
