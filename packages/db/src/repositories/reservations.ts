import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveActivePolicies, transitionIntent, type PolicyVersionInput, type ReconciliationResult, type TransitionGuard } from "@allen-saji/praxis-control-plane";
import * as schema from "../schema";
import { DbDomainError } from "../errors";
import { withSerializationRetry } from "./transactions";
import { appendAuditEvent } from "./audit";

type Db = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type PeriodKind = "day" | "month";

export class BudgetLimitError extends Error {
  readonly code = "BUDGET_EXCEEDED";

  constructor(readonly periodKind: PeriodKind) {
    super(`${periodKind} budget would be exceeded`);
    this.name = "BudgetLimitError";
  }
}

export type ReserveInput = {
  intentId: string;
  organizationId: string;
  walletId: string;
  assignmentId: string;
  amountMist?: bigint;
  ttlMs: number;
  actorId?: string;
};

export type DefiniteNonExecutionProof = { kind: "definite_nonexecution"; intentId: string; purposeTag: string; noSubmission: true; failureCode: string };
export type ReservationReleaseInput = { organizationId: string; reservationId: string; proof: DefiniteNonExecutionProof };
export type ReconciledReleaseInput = { organizationId: string; reservationId: string; proof: ReconciliationResult };
export type ReservationCommitInput = { organizationId: string; reservationId: string; proof: ReconciliationResult };
type SettlementProof = TransitionGuard | DefiniteNonExecutionProof;

/**
 * Persists a reservation while locking both wallet and assignment counters.
 * The intent row is locked first, making retries for one intent idempotent and
 * preventing two concurrent requests from reserving the same intent twice.
 */
export class ReservationRepository {
  constructor(private readonly db: Db) {}

  async reserve(input: ReserveInput) {
    return withSerializationRetry(() => this.db.transaction(async (tx) => {
      const [clock] = await tx.execute(sql`select transaction_timestamp() as now`) as unknown as [{ now: string | Date }];
      if (!clock?.now) throw new DbDomainError("DB_CLOCK_UNAVAILABLE", "database clock is unavailable");
      const now = new Date(clock.now);
      if (!Number.isInteger(input.ttlMs) || input.ttlMs < 1_000 || input.ttlMs > 900_000) throw new DbDomainError("INVALID_RESERVATION", "reservation duration is outside the allowed bound");
      const expiresAt = new Date(now.getTime() + input.ttlMs);
      const [loaded] = await tx.select({
        intent: schema.spendIntents,
        walletStatus: schema.wallets.executionStatus,
        walletArchivedAt: schema.wallets.archivedAt,
        assignmentStatus: schema.assignments.status,
        agentStatus: schema.agents.status,
        credentialExpiresAt: schema.agentCredentials.expiresAt,
        credentialRevokedAt: schema.agentCredentials.revokedAt,
      }).from(schema.spendIntents)
        .innerJoin(schema.wallets, and(eq(schema.wallets.id, schema.spendIntents.walletId), eq(schema.wallets.organizationId, schema.spendIntents.organizationId)))
        .innerJoin(schema.assignments, and(eq(schema.assignments.id, schema.spendIntents.assignmentId), eq(schema.assignments.organizationId, schema.spendIntents.organizationId)))
        .innerJoin(schema.agents, and(eq(schema.agents.id, schema.spendIntents.agentId), eq(schema.agents.organizationId, schema.spendIntents.organizationId)))
        .innerJoin(schema.agentCredentials, and(eq(schema.agentCredentials.id, schema.spendIntents.credentialId), eq(schema.agentCredentials.organizationId, schema.spendIntents.organizationId)))
        .where(and(eq(schema.spendIntents.id, input.intentId), eq(schema.spendIntents.organizationId, input.organizationId)))
        .for("update");

      const intent = loaded?.intent;
      if (!loaded || !intent || intent.walletId !== input.walletId || intent.assignmentId !== input.assignmentId) {
        throw new DbDomainError("RESERVATION_SCOPE_MISMATCH", "intent does not belong to the reservation scope");
      }
      if (loaded.walletStatus !== "enabled" || loaded.walletArchivedAt || loaded.assignmentStatus !== "active" || loaded.agentStatus !== "active") {
        throw new DbDomainError("RESERVATION_IDENTITY_INACTIVE", "execution identity is not active");
      }
      if (loaded.credentialRevokedAt || (loaded.credentialExpiresAt !== null && loaded.credentialExpiresAt <= now)) {
        throw new DbDomainError("RESERVATION_CREDENTIAL_INVALID", "execution credential is not valid");
      }
      const amountMist = BigInt(intent.amountMist);
      if (input.amountMist !== undefined && input.amountMist !== amountMist) {
        throw new DbDomainError("RESERVATION_AMOUNT_MISMATCH", "reservation amount must match the intent");
      }

      const [existing] = await tx.select().from(schema.budgetReservations)
        .where(and(eq(schema.budgetReservations.intentId, input.intentId), eq(schema.budgetReservations.organizationId, input.organizationId)))
        .for("update");
      if (existing) return { kind: "existing" as const, reservation: existing };
      if (intent.state !== "received") throw new DbDomainError("INTENT_NOT_RESERVABLE", "intent is not in the received state");
      const periods = periodRows(now);

      // All callers lock day before month and wallet before assignment. This
      // ordering prevents the reservation path from introducing deadlocks.
      const walletCounters = [];
      const assignmentCounters = [];
      for (const period of periods) {
        await tx.insert(schema.walletBudgetCounters).values({
          walletId: input.walletId,
          periodKind: period.kind,
          periodStart: period.start,
        }).onConflictDoNothing();
        const [counter] = await tx.select().from(schema.walletBudgetCounters)
          .where(and(
            eq(schema.walletBudgetCounters.walletId, input.walletId),
            eq(schema.walletBudgetCounters.periodKind, period.kind),
            eq(schema.walletBudgetCounters.periodStart, period.start),
          )).for("update");
        if (!counter) throw new Error("wallet budget counter was not created");
        walletCounters.push(counter);
      }
      for (const period of periods) {
        await tx.insert(schema.assignmentBudgetCounters).values({
          assignmentId: input.assignmentId,
          periodKind: period.kind,
          periodStart: period.start,
        }).onConflictDoNothing();
        const [counter] = await tx.select().from(schema.assignmentBudgetCounters)
          .where(and(
            eq(schema.assignmentBudgetCounters.assignmentId, input.assignmentId),
            eq(schema.assignmentBudgetCounters.periodKind, period.kind),
            eq(schema.assignmentBudgetCounters.periodStart, period.start),
          )).for("update");
        if (!counter) throw new Error("assignment budget counter was not created");
        assignmentCounters.push(counter);
      }

      // Re-read and lock the complete execution identity after counter locks.
      // Status, revocation, and expiry changes must not race the reservation.
      const [postLockIdentity] = await tx.select({
        walletStatus: schema.wallets.executionStatus,
        walletArchivedAt: schema.wallets.archivedAt,
        assignmentStatus: schema.assignments.status,
        agentStatus: schema.agents.status,
        credentialExpiresAt: schema.agentCredentials.expiresAt,
        credentialRevokedAt: schema.agentCredentials.revokedAt,
      }).from(schema.wallets)
        .innerJoin(schema.assignments, and(eq(schema.assignments.id, intent.assignmentId), eq(schema.assignments.organizationId, input.organizationId), eq(schema.assignments.walletId, schema.wallets.id)))
        .innerJoin(schema.agents, and(eq(schema.agents.id, intent.agentId), eq(schema.agents.organizationId, input.organizationId), eq(schema.agents.id, schema.assignments.agentId)))
        .innerJoin(schema.agentCredentials, and(eq(schema.agentCredentials.id, intent.credentialId), eq(schema.agentCredentials.organizationId, input.organizationId), eq(schema.agentCredentials.assignmentId, schema.assignments.id)))
        .where(and(eq(schema.wallets.id, intent.walletId), eq(schema.wallets.organizationId, input.organizationId)))
        .for("update");
      if (!postLockIdentity || postLockIdentity.walletStatus !== "enabled" || postLockIdentity.walletArchivedAt || postLockIdentity.assignmentStatus !== "active" || postLockIdentity.agentStatus !== "active") {
        throw new DbDomainError("RESERVATION_IDENTITY_INACTIVE", "execution identity changed while reserving");
      }
      if (postLockIdentity.credentialRevokedAt || (postLockIdentity.credentialExpiresAt !== null && postLockIdentity.credentialExpiresAt <= now)) {
        throw new DbDomainError("RESERVATION_CREDENTIAL_INVALID", "execution credential changed while reserving");
      }

      // Policies are re-read only after all four counters have been locked, so
      // a concurrent activation cannot be observed halfway through a reserve.
      const walletPolicy = await activePolicy(tx, input.organizationId, "wallet", input.walletId);
      const assignmentPolicy = await activePolicy(tx, input.organizationId, "assignment", input.assignmentId);
      if (!walletPolicy || !assignmentPolicy) throw new DbDomainError("NO_ACTIVE_POLICY", "both wallet and assignment policies are required");
      const walletRules = await tx.select().from(schema.policyRecipientRules).where(eq(schema.policyRecipientRules.policyVersionId, walletPolicy.id));
      const assignmentRules = await tx.select().from(schema.policyRecipientRules).where(eq(schema.policyRecipientRules.policyVersionId, assignmentPolicy.id));
      const resolved = resolveActivePolicies({
        wallet: { scope: { id: walletPolicy.scopeId, scopeType: "wallet", walletId: input.walletId, currentVersionId: walletPolicy.id }, versions: [toPolicyVersion(walletPolicy)] },
        assignment: { scope: { id: assignmentPolicy.scopeId, scopeType: "assignment", assignmentId: input.assignmentId, currentVersionId: assignmentPolicy.id }, versions: [toPolicyVersion(assignmentPolicy)] },
      });
      const effectivePolicyHash = resolved.snapshot.effectivePolicyHash;
      const policySnapshotJson = JSON.parse(resolved.snapshotJson) as Record<string, unknown>;
      if (!enforceRecipient(intent.recipient, walletRules) || !enforceRecipient(intent.recipient, assignmentRules) || amountMist > BigInt(walletPolicy.maxPerTxMist) || amountMist > BigInt(assignmentPolicy.maxPerTxMist)) {
        const [blocked] = await tx.update(schema.spendIntents).set({ walletPolicyVersionId: walletPolicy.id, walletPolicyHash: walletPolicy.policyHash, assignmentPolicyVersionId: assignmentPolicy.id, assignmentPolicyHash: assignmentPolicy.policyHash, effectivePolicyHash, policySnapshotJson, abortReason: "POLICY_BLOCKED", state: "policy_blocked", stateVersion: intent.stateVersion + 1, updatedAt: now }).where(and(eq(schema.spendIntents.id, intent.id), eq(schema.spendIntents.organizationId, input.organizationId), eq(schema.spendIntents.state, "received"), eq(schema.spendIntents.stateVersion, intent.stateVersion))).returning();
        if (!blocked) throw new DbDomainError("INTENT_TRANSITION_RACE", "intent changed before policy blocking could commit");
        await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "system", actorId: input.actorId ?? null, eventType: "intent_policy_blocked", subjectType: "spend_intent", subjectId: intent.id, metadataJson: { effectivePolicyHash } });
        return { kind: "blocked" as const, intent: blocked };
      }
      const walletLimits = { day: BigInt(walletPolicy.maxPerDayMist), month: BigInt(walletPolicy.maxPerMonthMist) };
      const assignmentLimits = { day: BigInt(assignmentPolicy.maxPerDayMist), month: BigInt(assignmentPolicy.maxPerMonthMist) };

      for (const row of walletCounters) {
        const remaining = walletLimits[row.periodKind as PeriodKind] - BigInt(row.spentMist) - BigInt(row.reservedMist);
        if (amountMist > remaining) throw new BudgetLimitError(row.periodKind as PeriodKind);
      }
      for (const row of assignmentCounters) {
        const remaining = assignmentLimits[row.periodKind as PeriodKind] - BigInt(row.spentMist) - BigInt(row.reservedMist);
        if (amountMist > remaining) throw new BudgetLimitError(row.periodKind as PeriodKind);
      }

      for (const counter of walletCounters) {
        await tx.update(schema.walletBudgetCounters).set({
          reservedMist: sql`${schema.walletBudgetCounters.reservedMist} + ${amountMist.toString()}`,
          updatedAt: now,
        }).where(and(
          eq(schema.walletBudgetCounters.walletId, input.walletId),
          eq(schema.walletBudgetCounters.periodKind, counter.periodKind),
          eq(schema.walletBudgetCounters.periodStart, counter.periodStart),
        ));
      }
      for (const counter of assignmentCounters) {
        await tx.update(schema.assignmentBudgetCounters).set({
          reservedMist: sql`${schema.assignmentBudgetCounters.reservedMist} + ${amountMist.toString()}`,
          updatedAt: now,
        }).where(and(
          eq(schema.assignmentBudgetCounters.assignmentId, input.assignmentId),
          eq(schema.assignmentBudgetCounters.periodKind, counter.periodKind),
          eq(schema.assignmentBudgetCounters.periodStart, counter.periodStart),
        ));
      }

      const [reservation] = await tx.insert(schema.budgetReservations).values({
        organizationId: input.organizationId,
        intentId: input.intentId,
        walletId: input.walletId,
        assignmentId: input.assignmentId,
        amountMist: amountMist.toString(),
        expiresAt,
        createdAt: now,
        updatedAt: now,
      }).returning();
      if (!reservation) throw new Error("reservation was not created");
      const [reservedIntent] = await tx.update(schema.spendIntents).set({
        walletPolicyVersionId: walletPolicy.id,
        walletPolicyHash: walletPolicy.policyHash,
        assignmentPolicyVersionId: assignmentPolicy.id,
        assignmentPolicyHash: assignmentPolicy.policyHash,
        effectivePolicyHash,
        policySnapshotJson,
        state: "reserved",
        stateVersion: intent.stateVersion + 1,
        updatedAt: now,
      }).where(and(eq(schema.spendIntents.id, intent.id), eq(schema.spendIntents.organizationId, input.organizationId), eq(schema.spendIntents.state, "received"), eq(schema.spendIntents.stateVersion, intent.stateVersion))).returning();
      if (!reservedIntent) throw new DbDomainError("INTENT_TRANSITION_RACE", "intent changed before reservation could commit");
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "system", actorId: input.actorId ?? null, eventType: "reservation_created", subjectType: "budget_reservation", subjectId: reservation.id, metadataJson: { intentId: intent.id, amountMist: amountMist.toString(), reservationId: reservation.id } });
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "system", actorId: input.actorId ?? null, eventType: "intent_reserved", subjectType: "spend_intent", subjectId: intent.id, metadataJson: { reservationId: reservation.id, amountMist: amountMist.toString(), effectivePolicyHash } });
      return { kind: "created" as const, reservation };
    }));
  }

  async release(input: ReservationReleaseInput) {
    return this.releaseDefiniteNonExecution(input);
  }

  async releaseDefiniteNonExecution(input: ReservationReleaseInput) {
    return this.settle(input.reservationId, "released", input.organizationId, input.proof, "definite_nonexecution");
  }

  async releasePreSign(input: ReservationReleaseInput) {
    return this.settle(input.reservationId, "released", input.organizationId, input.proof, "pre_sign");
  }

  async releaseReconciledUnknown(input: ReconciledReleaseInput) {
    return this.settle(input.reservationId, "released", input.organizationId, input.proof, "reconciled_unknown");
  }

  async expire(input: { organizationId: string; reservationId: string }) {
    return this.settle(input.reservationId, "expired", input.organizationId, undefined, "expired");
  }

  async commit(input: ReservationCommitInput) {
    if (input.proof.kind !== "confirmed" || input.proof.outcome !== "confirmed") throw new DbDomainError("CHAIN_PROOF_REQUIRED", "confirming a reservation requires a confirmed reconciliation result");
    return this.settle(input.reservationId, "committed", input.organizationId, input.proof, "confirmed");
  }

  private async settle(reservationId: string, nextState: "released" | "committed" | "expired", organizationId: string, proof: SettlementProof | undefined, mode: "definite_nonexecution" | "pre_sign" | "reconciled_unknown" | "expired" | "confirmed") {
    return withSerializationRetry(() => this.db.transaction(async (tx) => {
      const [clock] = await tx.execute(sql`select transaction_timestamp() as now`) as unknown as [{ now: string | Date }];
      if (!clock?.now) throw new DbDomainError("DB_CLOCK_UNAVAILABLE", "database clock is unavailable");
      const now = new Date(clock.now);
      const [reservation] = await tx.select().from(schema.budgetReservations)
        .where(and(eq(schema.budgetReservations.id, reservationId), eq(schema.budgetReservations.organizationId, organizationId)))
        .for("update");
      if (!reservation) return null;
      if (reservation.state !== "active") return { changed: false as const, reservation };
      const [intent] = await tx.select().from(schema.spendIntents).where(and(eq(schema.spendIntents.id, reservation.intentId), eq(schema.spendIntents.organizationId, reservation.organizationId))).for("update");
      if (!intent) throw new DbDomainError("RESERVATION_INTENT_MISSING", "reservation intent is missing");
      if (mode === "expired" && (intent.state !== "reserved" || reservation.expiresAt > now)) throw new DbDomainError("RESERVATION_NOT_EXPIRED", "only an expired reserved intent can be expired");
      if (mode === "definite_nonexecution" && !["simulating", "signing"].includes(intent.state)) throw new DbDomainError("INTENT_NOT_RELEASABLE", "definite non-execution release is not valid for this intent state");
      if (mode === "pre_sign" && intent.state !== "evidence_published") throw new DbDomainError("INTENT_NOT_RELEASABLE", "pre-sign release requires an evidence-published intent");
      if (mode === "reconciled_unknown" && !["submitted", "submission_unknown"].includes(intent.state)) throw new DbDomainError("INTENT_NOT_RECONCILABLE", "reconciliation release requires a submitted or unknown intent");
      if (nextState === "committed" && intent.state !== "submitted" && intent.state !== "submission_unknown") {
        throw new DbDomainError("INTENT_NOT_COMMITTABLE", "only submitted intents can commit reserved usage");
      }
      if (mode !== "expired" && (!proof || !proofBoundToIntent(proof, intent.id, intent.purposeTag))) throw new DbDomainError("RECONCILIATION_PROOF_REQUIRED", "settlement proof is missing or bound to another intent");

      const periods = periodRows(reservation.createdAt);
      const walletCounters = [];
      const assignmentCounters = [];
      for (const period of periods) {
        const [counter] = await tx.select().from(schema.walletBudgetCounters)
          .where(and(
            eq(schema.walletBudgetCounters.walletId, reservation.walletId),
            eq(schema.walletBudgetCounters.periodKind, period.kind),
            eq(schema.walletBudgetCounters.periodStart, period.start),
          )).for("update");
        if (!counter) throw new Error("wallet budget counter is missing");
        walletCounters.push(counter);
      }
      for (const period of periods) {
        const [counter] = await tx.select().from(schema.assignmentBudgetCounters)
          .where(and(
            eq(schema.assignmentBudgetCounters.assignmentId, reservation.assignmentId),
            eq(schema.assignmentBudgetCounters.periodKind, period.kind),
            eq(schema.assignmentBudgetCounters.periodStart, period.start),
          )).for("update");
        if (!counter) throw new Error("assignment budget counter is missing");
        assignmentCounters.push(counter);
      }

      for (const counter of walletCounters) {
        await tx.update(schema.walletBudgetCounters).set({
          reservedMist: sql`${schema.walletBudgetCounters.reservedMist} - ${reservation.amountMist}`,
          ...(nextState === "committed" ? { spentMist: sql`${schema.walletBudgetCounters.spentMist} + ${reservation.amountMist}` } : {}),
          updatedAt: now,
        }).where(and(
          eq(schema.walletBudgetCounters.walletId, reservation.walletId),
          eq(schema.walletBudgetCounters.periodKind, counter.periodKind),
          eq(schema.walletBudgetCounters.periodStart, counter.periodStart),
        ));
      }
      for (const counter of assignmentCounters) {
        await tx.update(schema.assignmentBudgetCounters).set({
          reservedMist: sql`${schema.assignmentBudgetCounters.reservedMist} - ${reservation.amountMist}`,
          ...(nextState === "committed" ? { spentMist: sql`${schema.assignmentBudgetCounters.spentMist} + ${reservation.amountMist}` } : {}),
          updatedAt: now,
        }).where(and(
          eq(schema.assignmentBudgetCounters.assignmentId, reservation.assignmentId),
          eq(schema.assignmentBudgetCounters.periodKind, counter.periodKind),
          eq(schema.assignmentBudgetCounters.periodStart, counter.periodStart),
        ));
      }

      const [updated] = await tx.update(schema.budgetReservations).set({ state: nextState, updatedAt: now })
        .where(and(eq(schema.budgetReservations.id, reservationId), eq(schema.budgetReservations.state, "active")))
        .returning();
      if (!updated) return { changed: false as const, reservation };
      const finalState = nextState === "committed" ? "confirmed" : mode === "expired" ? "expired" : "failed";
      try {
        const guard = mode === "pre_sign" && proof?.kind === "definite_nonexecution"
          ? { kind: "evidence_failure" as const, errorCode: proof.failureCode, noSignature: true as const }
          : mode === "expired" || proof?.kind === "definite_nonexecution" ? undefined : proof;
        transitionIntent(intent.state, finalState, guard, { intentId: intent.id, expectedPurposeTag: intent.purposeTag });
      } catch (error) {
        throw new DbDomainError("RECONCILIATION_PROOF_REQUIRED", "settlement proof does not authorize this transition", error);
      }
      const txDigest = proof && "txDigest" in proof && typeof proof.txDigest === "string" ? proof.txDigest : undefined;
      const [finalIntent] = await tx.update(schema.spendIntents).set({
        state: finalState,
        stateVersion: intent.stateVersion + 1,
        ...(finalState === "confirmed" ? { outcome: "confirmed" as const } : finalState === "failed" ? { outcome: "failed" as const } : {}),
        ...(txDigest ? { txDigest } : {}),
        ...(nextState === "released" && mode !== "expired" ? { failureCode: proof?.kind === "definite_nonexecution" || proof?.kind === "definite_failure" ? proof.failureCode : "RESERVATION_RELEASED" } : {}),
        completedAt: now,
        updatedAt: now,
      }).where(and(eq(schema.spendIntents.id, intent.id), eq(schema.spendIntents.organizationId, reservation.organizationId), eq(schema.spendIntents.state, intent.state), eq(schema.spendIntents.stateVersion, intent.stateVersion))).returning();
      if (!finalIntent) throw new DbDomainError("INTENT_TRANSITION_RACE", "intent changed before reservation settlement could commit");
      await appendAuditEvent(tx, { organizationId: reservation.organizationId, actorType: "system", actorId: null, eventType: nextState === "committed" ? "reservation_committed" : nextState === "expired" ? "reservation_expired" : "reservation_released", subjectType: "budget_reservation", subjectId: reservation.id, metadataJson: { reservationId: reservation.id, state: nextState } });
      await appendAuditEvent(tx, { organizationId: reservation.organizationId, actorType: "system", actorId: null, eventType: nextState === "committed" ? "intent_confirmed" : nextState === "expired" ? "intent_expired" : "intent_failed", subjectType: "spend_intent", subjectId: intent.id, metadataJson: { reservationId, state: nextState, txDigest: txDigest ?? null } });
      return { changed: true as const, reservation: updated };
    }));
  }
}

function proofBoundToIntent(proof: SettlementProof, intentId: string, purposeTag: string): boolean {
  if (proof.kind === "definite_nonexecution") return proof.noSubmission === true && proof.intentId === intentId && proof.purposeTag === purposeTag && proof.failureCode.length > 0;
  if (proof.kind === "evidence_failure") return false;
  return proof.evidence.intentId === intentId && proof.evidence.purposeTag === purposeTag;
}

async function activePolicy(tx: Tx, organizationId: string, scopeType: "wallet" | "assignment", subjectId: string) {
  const [row] = await tx.select({ policy: schema.policyVersions }).from(schema.policyScopes)
    .innerJoin(schema.policyVersions, and(eq(schema.policyVersions.id, schema.policyScopes.currentVersionId), eq(schema.policyVersions.status, "active")))
    .where(and(eq(schema.policyScopes.organizationId, organizationId), eq(schema.policyScopes.scopeType, scopeType), scopeType === "wallet" ? eq(schema.policyScopes.walletId, subjectId) : eq(schema.policyScopes.assignmentId, subjectId)))
    .for("update");
  return row?.policy ?? null;
}

function toPolicyVersion(policy: { id: string; scopeId: string; version: number; status: "draft" | "active" | "superseded"; canonicalJson: unknown; policyHash: string }): PolicyVersionInput {
  return { id: policy.id, scopeId: policy.scopeId, version: policy.version, status: policy.status, canonicalJson: policy.canonicalJson, policyHash: policy.policyHash };
}

function enforceRecipient(recipient: string, rules: readonly { recipient: string; effect: string }[]): boolean {
  const matching = rules.filter((rule) => rule.recipient === recipient);
  if (rules.some((rule) => rule.effect === "deny" && rule.recipient === recipient) || (rules.some((rule) => rule.effect === "allow") && !matching.some((rule) => rule.effect === "allow"))) {
    return false;
  }
  return true;
}

function periodRows(at: Date): Array<{ kind: PeriodKind; start: Date }> {
  return [
    { kind: "day", start: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())) },
    { kind: "month", start: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)) },
  ];
}
