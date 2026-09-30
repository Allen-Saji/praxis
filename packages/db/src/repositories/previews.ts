import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveActivePolicies, type BudgetUsage } from "@allen-saji/praxis-control-plane";
import * as schema from "../schema";
import { DbDomainError } from "../errors";

export type PreviewIdentity = { organizationId: string; walletId: string; agentId: string; assignmentId: string; credentialId: string };

/** An advisory snapshot. Only ReservationRepository can grant budget to a spend. */
export class SpendingPreviewRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  async snapshot(identity: PreviewIdentity) {
    return this.db.transaction(async (tx) => {
      const [clock] = await tx.execute(sql`select transaction_timestamp() as now`) as unknown as [{ now: Date | string }];
      const now = new Date(clock.now);
      const [subject] = await tx.select({ address: schema.wallets.suiAddress }).from(schema.assignments)
        .innerJoin(schema.organizations, eq(schema.organizations.id, schema.assignments.organizationId))
        .innerJoin(schema.wallets, and(eq(schema.wallets.id, schema.assignments.walletId), eq(schema.wallets.organizationId, identity.organizationId)))
        .innerJoin(schema.agents, and(eq(schema.agents.id, schema.assignments.agentId), eq(schema.agents.organizationId, identity.organizationId)))
        .innerJoin(schema.agentCredentials, and(eq(schema.agentCredentials.assignmentId, schema.assignments.id), eq(schema.agentCredentials.organizationId, identity.organizationId)))
        .where(and(
          eq(schema.assignments.id, identity.assignmentId), eq(schema.assignments.organizationId, identity.organizationId),
          eq(schema.assignments.walletId, identity.walletId), eq(schema.assignments.agentId, identity.agentId),
          eq(schema.agentCredentials.id, identity.credentialId), eq(schema.assignments.status, "active"),
          eq(schema.organizations.status, "active"), eq(schema.agents.status, "active"),
          eq(schema.wallets.executionStatus, "enabled"), isNull(schema.wallets.archivedAt),
          isNull(schema.agentCredentials.revokedAt),
          or(isNull(schema.agentCredentials.expiresAt), sql`${schema.agentCredentials.expiresAt} > ${now.toISOString()}`),
        )).limit(1);
      if (!subject) throw new DbDomainError("PREVIEW_IDENTITY_INACTIVE", "Agent access is unavailable");
      const policies = await tx.select({ scope: schema.policyScopes, version: schema.policyVersions })
        .from(schema.policyScopes).innerJoin(schema.policyVersions, and(eq(schema.policyScopes.currentVersionId, schema.policyVersions.id), eq(schema.policyVersions.status, "active")))
        .where(and(eq(schema.policyScopes.organizationId, identity.organizationId), or(
          and(eq(schema.policyScopes.scopeType, "wallet"), eq(schema.policyScopes.walletId, identity.walletId)),
          and(eq(schema.policyScopes.scopeType, "assignment"), eq(schema.policyScopes.assignmentId, identity.assignmentId)),
        )));
      const wallet = policies.find((item) => item.scope.scopeType === "wallet")?.version;
      const assignment = policies.find((item) => item.scope.scopeType === "assignment")?.version;
      if (!wallet || !assignment) throw new DbDomainError("NO_ACTIVE_POLICY", "Activate wallet and agent limits first");
      const resolved = resolveActivePolicies({ walletPolicy: wallet, assignmentPolicy: assignment });
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const [walletCounters, assignmentCounters] = await Promise.all([
        tx.select().from(schema.walletBudgetCounters).where(and(eq(schema.walletBudgetCounters.walletId, identity.walletId), inArray(schema.walletBudgetCounters.periodStart, [day, month]))),
        tx.select().from(schema.assignmentBudgetCounters).where(and(eq(schema.assignmentBudgetCounters.assignmentId, identity.assignmentId), inArray(schema.assignmentBudgetCounters.periodStart, [day, month]))),
      ]);
      const periodUsage = (rows: Array<{ periodKind: string; periodStart: Date; spentMist: string; reservedMist: string }>, period: "day" | "month") => {
        const start = period === "day" ? day : month;
        const row = rows.find((item) => item.periodKind === period && item.periodStart.getTime() === start.getTime());
        return { spentMist: row?.spentMist ?? "0", reservedMist: row?.reservedMist ?? "0" };
      };
      const usage = {
        wallet: { day: periodUsage(walletCounters, "day"), month: periodUsage(walletCounters, "month") },
        assignment: { day: periodUsage(assignmentCounters, "day"), month: periodUsage(assignmentCounters, "month") },
      } satisfies BudgetUsage;
      return { observedAt: now, address: subject.address, policies: resolved, usage };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }
}
