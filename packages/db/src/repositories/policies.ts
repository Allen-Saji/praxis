import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { DbDomainError } from "../errors";
import { canonicalJson, hashCanonical, toCanonicalPolicy, type CanonicalPolicy, type PolicyRule } from "../policy";
import { withSerializationRetry } from "./transactions";
import { appendAuditEvent } from "./audit";

type Db = PostgresJsDatabase<typeof schema>;

export type PolicyInput = {
  scopeId: string;
  organizationId: string;
  version?: number;
  createdByUserId: string;
  maxPerTxMist: bigint | string;
  maxPerDayMist: bigint | string;
  maxPerMonthMist: bigint | string;
  blockRiskScoreAt: number;
  requireSimulation: true;
  rules?: readonly PolicyRule[];
};

export type PolicyActivation = {
  scopeId: string;
  versionId: string;
  organizationId: string;
  actorId: string;
};

export class PolicyRepository {
  constructor(private readonly db: Db) {}

  async createScope(input: { organizationId: string; actorId: string; scopeType: "wallet" | "assignment"; walletId?: string; assignmentId?: string }) {
    const walletId = input.walletId;
    if (input.scopeType === "wallet" && (!walletId || input.assignmentId)) throw new DbDomainError("INVALID_POLICY_SCOPE", "wallet scope requires exactly one wallet");
    if (input.scopeType === "assignment" && (!input.assignmentId || walletId)) throw new DbDomainError("INVALID_POLICY_SCOPE", "assignment scope requires exactly one assignment");
    return withSerializationRetry(() => this.db.transaction(async (tx) => {
      const [actor] = await tx.select({ id: schema.organizationMembers.userId })
        .from(schema.organizationMembers)
        .innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMembers.organizationId))
        .where(and(
          eq(schema.organizationMembers.organizationId, input.organizationId),
          eq(schema.organizationMembers.userId, input.actorId),
          eq(schema.organizations.status, "active"),
          inArray(schema.organizationMembers.role, ["owner", "admin"]),
        )).limit(1);
      if (!actor) throw new DbDomainError("POLICY_SCOPE_CREATOR_UNAUTHORIZED", "policy scope creator is not an active organization administrator");
      if (input.scopeType === "wallet") {
        const [wallet] = await tx.select({ id: schema.wallets.id }).from(schema.wallets).where(and(eq(schema.wallets.id, walletId!), eq(schema.wallets.organizationId, input.organizationId))).limit(1);
        if (!wallet) throw new DbDomainError("POLICY_SCOPE_SUBJECT_NOT_FOUND", "wallet does not belong to the organization");
      } else {
        const [assignment] = await tx.select({ id: schema.assignments.id }).from(schema.assignments).where(and(eq(schema.assignments.id, input.assignmentId!), eq(schema.assignments.organizationId, input.organizationId))).limit(1);
        if (!assignment) throw new DbDomainError("POLICY_SCOPE_SUBJECT_NOT_FOUND", "assignment does not belong to the organization");
      }
      const [scope] = await tx.insert(schema.policyScopes).values({ organizationId: input.organizationId, scopeType: input.scopeType, walletId, assignmentId: input.assignmentId }).returning();
      if (!scope) throw new DbDomainError("POLICY_SCOPE_CREATE_FAILED", "policy scope was not created");
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.actorId, eventType: "policy_scope_created", subjectType: "policy_scope", subjectId: scope.id, metadataJson: { scopeType: input.scopeType, scopeId: scope.id } });
      return scope;
    }));
  }

  async createDraft(input: PolicyInput) {
    const document = toCanonicalPolicy(input);
    return withSerializationRetry(() => this.db.transaction(async (tx) => {
      const [scope] = await tx.select({ id: schema.policyScopes.id }).from(schema.policyScopes).where(and(eq(schema.policyScopes.id, input.scopeId), eq(schema.policyScopes.organizationId, input.organizationId))).for("update");
      if (!scope) throw new DbDomainError("POLICY_SCOPE_NOT_FOUND", "policy scope was not found");
      const [creator] = await tx.select({ id: schema.organizationMembers.userId }).from(schema.organizationMembers).innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMembers.organizationId)).where(and(eq(schema.organizationMembers.organizationId, input.organizationId), eq(schema.organizationMembers.userId, input.createdByUserId), eq(schema.organizations.status, "active"), inArray(schema.organizationMembers.role, ["owner", "admin"]))).limit(1);
      if (!creator) throw new DbDomainError("POLICY_CREATOR_UNAUTHORIZED", "policy creator is not an active organization administrator");
      const [latest] = await tx.select({ version: schema.policyVersions.version }).from(schema.policyVersions).where(eq(schema.policyVersions.scopeId, input.scopeId)).orderBy(sql`${schema.policyVersions.version} desc`).limit(1);
      const version = input.version ?? ((latest?.version ?? 0) + 1);
      const [draft] = await tx.insert(schema.policyVersions).values({
        scopeId: input.scopeId,
        version,
        status: "draft",
        maxPerTxMist: document.maxPerTxMist,
        maxPerDayMist: document.maxPerDayMist,
        maxPerMonthMist: document.maxPerMonthMist,
        blockRiskScoreAt: document.blockRiskScoreAt,
        requireSimulation: true,
        canonicalJson: JSON.parse(canonicalJson(document)) as CanonicalPolicy,
        policyHash: hashCanonical(document),
        createdByUserId: input.createdByUserId,
      }).returning();
      if (!draft) throw new DbDomainError("POLICY_DRAFT_CREATE_FAILED", "policy draft was not created");
      if (document.rules.length > 0) {
        await tx.insert(schema.policyRecipientRules).values(document.rules.map((rule) => ({ policyVersionId: draft.id, recipient: rule.recipient, effect: rule.effect })));
      }
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.createdByUserId, eventType: "policy_draft_created", subjectType: "policy_version", subjectId: draft.id, metadataJson: { scopeId: input.scopeId, version: draft.version, policyHash: draft.policyHash } });
      return draft;
    }));
  }

  async activate(input: PolicyActivation) {
    return withSerializationRetry(() => this.db.transaction(async (tx) => {
      const [scope] = await tx.select().from(schema.policyScopes).where(and(eq(schema.policyScopes.id, input.scopeId), eq(schema.policyScopes.organizationId, input.organizationId))).for("update");
      if (!scope) throw new DbDomainError("POLICY_SCOPE_NOT_FOUND", "policy scope was not found");
      const [actor] = await tx.select({ id: schema.organizationMembers.userId })
        .from(schema.organizationMembers)
        .innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMembers.organizationId))
        .where(and(
          eq(schema.organizationMembers.organizationId, input.organizationId),
          eq(schema.organizationMembers.userId, input.actorId),
          eq(schema.organizations.status, "active"),
          inArray(schema.organizationMembers.role, ["owner", "admin"]),
        )).limit(1);
      if (!actor) throw new DbDomainError("POLICY_ACTIVATOR_UNAUTHORIZED", "policy activator is not an active organization administrator");
      const [draft] = await tx.select().from(schema.policyVersions).where(and(eq(schema.policyVersions.id, input.versionId), eq(schema.policyVersions.scopeId, input.scopeId), eq(schema.policyVersions.status, "draft"))).for("update");
      if (!draft) throw new DbDomainError("POLICY_DRAFT_NOT_FOUND", "only an existing draft can be activated");
      validateStoredPolicy(draft);
      const storedRules = await tx.select({ recipient: schema.policyRecipientRules.recipient, effect: schema.policyRecipientRules.effect })
        .from(schema.policyRecipientRules).where(eq(schema.policyRecipientRules.policyVersionId, draft.id));
      const expectedRules = (draft.canonicalJson as { rules?: unknown }).rules;
      const normalizedExpectedRules = Array.isArray(expectedRules) ? expectedRules.map((rule) => {
        const value = rule as { recipient?: unknown; effect?: unknown };
        return { recipient: value.recipient as string, effect: value.effect as string };
      }) : null;
      if (!normalizedExpectedRules || JSON.stringify(storedRules.sort(compareRules)) !== JSON.stringify(normalizedExpectedRules.sort(compareRules))) {
        throw new DbDomainError("POLICY_DOCUMENT_MISMATCH", "stored policy recipient rules do not match the canonical policy document");
      }
      const [old] = await tx.select().from(schema.policyVersions).where(and(eq(schema.policyVersions.scopeId, input.scopeId), eq(schema.policyVersions.status, "active"))).for("update");
      const [clock] = await tx.execute(sql`select transaction_timestamp() as now`) as unknown as [{ now: string | Date }];
      if (!clock?.now) throw new DbDomainError("DB_CLOCK_UNAVAILABLE", "database clock is unavailable");
      const activatedAt = new Date(clock.now);
      if (old) {
        await tx.update(schema.policyVersions).set({ status: "superseded", supersededAt: activatedAt }).where(and(eq(schema.policyVersions.id, old.id), eq(schema.policyVersions.status, "active")));
      }
      const [activated] = await tx.update(schema.policyVersions).set({ status: "active", activatedAt }).where(and(eq(schema.policyVersions.id, draft.id), eq(schema.policyVersions.status, "draft"))).returning();
      if (!activated) throw new DbDomainError("POLICY_ACTIVATION_RACE", "policy activation lost a compare-and-swap race");
      await tx.update(schema.policyScopes).set({ currentVersionId: activated.id }).where(eq(schema.policyScopes.id, scope.id));
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.actorId, eventType: "policy_activated", subjectType: "policy_version", subjectId: activated.id, metadataJson: { scopeId: input.scopeId, version: activated.version, policyHash: activated.policyHash } });
      if (old) await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "user", actorId: input.actorId, eventType: "policy_superseded", subjectType: "policy_version", subjectId: old.id, metadataJson: { scopeId: input.scopeId, version: old.version, policyHash: old.policyHash } });
      return activated;
    }));
  }

  async active(scopeId: string, organizationId: string) {
    const [row] = await this.db.select({ version: schema.policyVersions, scope: schema.policyScopes }).from(schema.policyScopes).innerJoin(schema.policyVersions, and(eq(schema.policyVersions.id, schema.policyScopes.currentVersionId), eq(schema.policyVersions.status, "active"))).where(and(eq(schema.policyScopes.id, scopeId), eq(schema.policyScopes.organizationId, organizationId))).limit(1);
    return row ?? null;
  }
}

function compareRules(left: { recipient: string; effect: string }, right: { recipient: string; effect: string }): number {
  return left.recipient === right.recipient ? left.effect.localeCompare(right.effect) : left.recipient.localeCompare(right.recipient);
}

function validateStoredPolicy(draft: { maxPerTxMist: string; maxPerDayMist: string; maxPerMonthMist: string; blockRiskScoreAt: number; requireSimulation: boolean; canonicalJson: unknown; policyHash: string }): void {
  try {
    const raw = draft.canonicalJson as { maxPerTxMist?: unknown; maxPerDayMist?: unknown; maxPerMonthMist?: unknown; blockRiskScoreAt?: unknown; requireSimulation?: unknown; rules?: unknown };
    const canonical = toCanonicalPolicy({
      maxPerTxMist: raw.maxPerTxMist as string,
      maxPerDayMist: raw.maxPerDayMist as string,
      maxPerMonthMist: raw.maxPerMonthMist as string,
      blockRiskScoreAt: raw.blockRiskScoreAt as number,
      requireSimulation: raw.requireSimulation as boolean,
      rules: raw.rules as PolicyRule[],
    });
    if (canonical.maxPerTxMist !== draft.maxPerTxMist || canonical.maxPerDayMist !== draft.maxPerDayMist || canonical.maxPerMonthMist !== draft.maxPerMonthMist || canonical.blockRiskScoreAt !== draft.blockRiskScoreAt || draft.requireSimulation !== true || hashCanonical(canonical) !== draft.policyHash) {
      throw new Error("policy fields do not match canonical document");
    }
  } catch (error) {
    throw new DbDomainError("POLICY_DOCUMENT_MISMATCH", "policy document is invalid or its hash does not match", error);
  }
}
