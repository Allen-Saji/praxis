import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveActivePolicies, type PolicyVersionInput } from "@allen-saji/praxis-control-plane";
import * as schema from "../schema";
import { DbDomainError } from "../errors";
import { withSerializationRetry } from "./transactions";
import { appendAuditEvent } from "./audit";

type Db = PostgresJsDatabase<typeof schema>;

export type LeaseInput = {
  organizationId: string;
  walletId: string;
  intentId: string;
  workerId: string;
  ttlMs: number;
};

export class WalletExecutionLeaseRepository {
  constructor(private readonly db: Db) {}

  async acquire(input: LeaseInput) {
    return withSerializationRetry(() => this.db.transaction(async (tx) => {
      const [clock] = await tx.execute(sql`select transaction_timestamp() as now`) as unknown as [{ now: string | Date }];
      if (!clock?.now) throw new DbDomainError("DB_CLOCK_UNAVAILABLE", "database clock is unavailable");
      const now = new Date(clock.now);
      if (!Number.isInteger(input.ttlMs) || input.ttlMs < 1_000 || input.ttlMs > 300_000) throw new DbDomainError("INVALID_LEASE", "lease duration is outside the allowed bound");
      const expiresAt = new Date(now.getTime() + input.ttlMs);
      const [identity] = await tx.select({ wallet: schema.wallets, intent: schema.spendIntents, assignment: schema.assignments, agent: schema.agents, credential: schema.agentCredentials, reservation: schema.budgetReservations })
        .from(schema.wallets)
        .innerJoin(schema.spendIntents, and(eq(schema.spendIntents.id, input.intentId), eq(schema.spendIntents.organizationId, input.organizationId), eq(schema.spendIntents.walletId, input.walletId)))
        .innerJoin(schema.assignments, and(eq(schema.assignments.id, schema.spendIntents.assignmentId), eq(schema.assignments.organizationId, input.organizationId), eq(schema.assignments.walletId, schema.wallets.id), eq(schema.assignments.agentId, schema.spendIntents.agentId)))
        .innerJoin(schema.agents, and(eq(schema.agents.id, schema.spendIntents.agentId), eq(schema.agents.organizationId, input.organizationId), eq(schema.agents.id, schema.assignments.agentId)))
        .innerJoin(schema.agentCredentials, and(eq(schema.agentCredentials.id, schema.spendIntents.credentialId), eq(schema.agentCredentials.organizationId, input.organizationId), eq(schema.agentCredentials.assignmentId, schema.assignments.id)))
        .innerJoin(schema.budgetReservations, and(eq(schema.budgetReservations.intentId, schema.spendIntents.id), eq(schema.budgetReservations.organizationId, input.organizationId), eq(schema.budgetReservations.walletId, schema.wallets.id), eq(schema.budgetReservations.assignmentId, schema.assignments.id), eq(schema.budgetReservations.state, "active")))
        .where(and(eq(schema.wallets.id, input.walletId), eq(schema.wallets.organizationId, input.organizationId)))
        .for("update");
      if (!identity || identity.wallet.executionStatus !== "enabled" || identity.wallet.archivedAt) throw new DbDomainError("LEASE_IDENTITY_INACTIVE", "wallet is not executable");
      const [active] = await tx.select({ lease: schema.walletExecutionLeases, intent: schema.spendIntents }).from(schema.walletExecutionLeases)
        .innerJoin(schema.spendIntents, and(eq(schema.spendIntents.id, schema.walletExecutionLeases.intentId), eq(schema.spendIntents.organizationId, schema.walletExecutionLeases.organizationId)))
        .where(and(eq(schema.walletExecutionLeases.organizationId, input.organizationId), eq(schema.walletExecutionLeases.walletId, input.walletId), isNull(schema.walletExecutionLeases.releasedAt)))
        .for("update");
      if (active && active.lease.expiresAt <= now && ["signing", "submitted", "submission_unknown"].includes(active.intent.state)) throw new DbDomainError("LEASE_RECLAIM_BLOCKED", "an expired lease for an uncertain execution cannot be reclaimed automatically");
      const validateEligibility = async (existingLease: boolean) => {
        const allowedState = identity.intent.state === "evidence_published" || (existingLease && ["signing", "submitted", "submission_unknown"].includes(identity.intent.state));
        if (!allowedState) throw new DbDomainError("LEASE_INTENT_NOT_READY", "execution leases require an evidence-published intent");
        if (BigInt(identity.reservation.amountMist) !== BigInt(identity.intent.amountMist)) throw new DbDomainError("LEASE_RESERVATION_MISMATCH", "active reservation does not match the intent amount");
        if (identity.reservation.expiresAt <= now) throw new DbDomainError("LEASE_RESERVATION_EXPIRED", "active reservation expired before signing");
        if (identity.assignment.status !== "active" || identity.agent.status !== "active") throw new DbDomainError("LEASE_IDENTITY_INACTIVE", "assignment and agent must be active");
        if (identity.credential.revokedAt || (identity.credential.expiresAt !== null && identity.credential.expiresAt <= now)) throw new DbDomainError("LEASE_CREDENTIAL_INVALID", "execution credential is not valid");
        const walletPolicy = await activePolicy(tx, input.organizationId, "wallet", input.walletId);
        const assignmentPolicy = await activePolicy(tx, input.organizationId, "assignment", identity.intent.assignmentId);
        if (!identity.intent.policySnapshotJson || !walletPolicy || !assignmentPolicy || identity.intent.walletPolicyVersionId !== walletPolicy.policy.id || identity.intent.walletPolicyHash !== walletPolicy.policy.policyHash || identity.intent.assignmentPolicyVersionId !== assignmentPolicy.policy.id || identity.intent.assignmentPolicyHash !== assignmentPolicy.policy.policyHash || !identity.intent.effectivePolicyHash) {
          throw new DbDomainError("LEASE_POLICY_MISMATCH", "active policies do not match the intent snapshot");
        }
        try {
          const resolved = resolveActivePolicies({
            wallet: { scope: { id: walletPolicy.scope.id, scopeType: "wallet", walletId: input.walletId, currentVersionId: walletPolicy.policy.id }, versions: [toPolicyVersion(walletPolicy.policy)] },
            assignment: { scope: { id: assignmentPolicy.scope.id, scopeType: "assignment", assignmentId: identity.intent.assignmentId, currentVersionId: assignmentPolicy.policy.id }, versions: [toPolicyVersion(assignmentPolicy.policy)] },
          });
          if (resolved.snapshot.effectivePolicyHash !== identity.intent.effectivePolicyHash) throw new DbDomainError("LEASE_POLICY_MISMATCH", "active policy hash does not match the intent snapshot");
        } catch (error) {
          if (error instanceof DbDomainError) throw error;
          throw new DbDomainError("LEASE_POLICY_MISMATCH", "active policy snapshot could not be verified", error);
        }
      };
      // Validate before returning an idempotent existing lease so status,
      // credential, reservation, and policy changes cannot bypass the gate.
      const sameOwnerExistingLease = Boolean(active && active.lease.expiresAt > now && active.lease.workerId === input.workerId && active.lease.intentId === input.intentId);
      await validateEligibility(sameOwnerExistingLease);
      if (active) {
        if (active.lease.expiresAt > now) {
          if (active.lease.workerId === input.workerId && active.lease.intentId === input.intentId) return { kind: "existing" as const, lease: active.lease };
          throw new DbDomainError("LEASE_BUSY", "wallet is already leased by another worker");
        }
        await tx.update(schema.walletExecutionLeases).set({ releasedAt: now }).where(and(eq(schema.walletExecutionLeases.id, active.lease.id), isNull(schema.walletExecutionLeases.releasedAt)));
        await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "system", actorId: input.workerId, eventType: "execution_lease_reclaimed", subjectType: "wallet_execution_lease", subjectId: active.lease.id, metadataJson: { walletId: active.lease.walletId, intentId: active.lease.intentId } });
      }
      const [lease] = await tx.insert(schema.walletExecutionLeases).values({
        organizationId: input.organizationId,
        walletId: input.walletId,
        intentId: input.intentId,
        workerId: input.workerId,
        acquiredAt: now,
        expiresAt,
      }).returning();
      if (!lease) throw new DbDomainError("LEASE_CREATE_FAILED", "wallet execution lease was not created");
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "worker", actorId: input.workerId, eventType: "execution_lease_acquired", subjectType: "wallet_execution_lease", subjectId: lease.id, metadataJson: { walletId: input.walletId, intentId: input.intentId, expiresAt: expiresAt.toISOString() } });
      return { kind: "created" as const, lease };
    }));
  }

  async release(input: { organizationId: string; leaseId: string; workerId: string }) {
    return withSerializationRetry(() => this.db.transaction(async (tx) => {
      const [clock] = await tx.execute(sql`select transaction_timestamp() as now`) as unknown as [{ now: string | Date }];
      if (!clock?.now) throw new DbDomainError("DB_CLOCK_UNAVAILABLE", "database clock is unavailable");
      const [lease] = await tx.update(schema.walletExecutionLeases).set({ releasedAt: new Date(clock.now) })
        .where(and(eq(schema.walletExecutionLeases.id, input.leaseId), eq(schema.walletExecutionLeases.organizationId, input.organizationId), eq(schema.walletExecutionLeases.workerId, input.workerId), isNull(schema.walletExecutionLeases.releasedAt)))
        .returning();
      if (lease) await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "worker", actorId: input.workerId, eventType: "execution_lease_released", subjectType: "wallet_execution_lease", subjectId: lease.id, metadataJson: {} });
      return lease ?? null;
    }));
  }

  async active(organizationId: string, walletId: string, workerId?: string) {
    const [lease] = await this.db.select().from(schema.walletExecutionLeases).where(and(eq(schema.walletExecutionLeases.organizationId, organizationId), eq(schema.walletExecutionLeases.walletId, walletId), isNull(schema.walletExecutionLeases.releasedAt), workerId ? eq(schema.walletExecutionLeases.workerId, workerId) : undefined, sql`${schema.walletExecutionLeases.expiresAt} > transaction_timestamp()`)).limit(1);
    return lease ?? null;
  }
}

async function activePolicy(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], organizationId: string, scopeType: "wallet" | "assignment", subjectId: string) {
  const [row] = await tx.select({ scope: schema.policyScopes, policy: schema.policyVersions }).from(schema.policyScopes)
    .innerJoin(schema.policyVersions, and(eq(schema.policyVersions.id, schema.policyScopes.currentVersionId), eq(schema.policyVersions.scopeId, schema.policyScopes.id), eq(schema.policyVersions.status, "active")))
    .where(and(eq(schema.policyScopes.organizationId, organizationId), eq(schema.policyScopes.scopeType, scopeType), scopeType === "wallet" ? eq(schema.policyScopes.walletId, subjectId) : eq(schema.policyScopes.assignmentId, subjectId)))
    .for("update");
  return row ?? null;
}

function toPolicyVersion(policy: { id: string; scopeId: string; version: number; status: "draft" | "active" | "superseded"; canonicalJson: unknown; policyHash: string }): PolicyVersionInput {
  return { id: policy.id, scopeId: policy.scopeId, version: policy.version, status: policy.status, canonicalJson: policy.canonicalJson, policyHash: policy.policyHash };
}
