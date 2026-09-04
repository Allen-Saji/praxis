import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveActivePolicies, transitionIntent, type PolicyVersionInput, type TransitionGuard } from "@allen-saji/praxis-control-plane";
import * as schema from "../schema";
import { DbDomainError } from "../errors";
import { withSerializationRetry } from "./transactions";
import { appendAuditEvent } from "./audit";
type IntentState = (typeof schema.intentState.enumValues)[number];

export type IntentTransitionDetails = {
  organizationId: string;
  actorId?: string;
  guard?: TransitionGuard;
  outcome?: "confirmed" | "blocked" | "failed";
  failureCode?: string;
  failureDetail?: string;
  txDigest?: string;
  receiptId?: string;
};

export type NewIntent = {
  organizationId: string; assignmentId: string; walletId: string; agentId: string; credentialId: string;
  idempotencyKey: string; requestHash: string; purposeTag: string; recipient: string;
  amountMist: bigint; reasoningJson: Record<string, unknown>;
};

export class IntentRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  async createOrLoad(input: NewIntent) {
    validateReasoningJson(input.reasoningJson);
    let created: typeof schema.spendIntents.$inferSelect | undefined;
    try {
      [created] = await this.db.transaction(async (tx) => {
        const [row] = await tx.insert(schema.spendIntents).values({ ...input, amountMist: input.amountMist.toString(), coinType: "0x2::sui::SUI", privacy: "public" }).onConflictDoNothing({ target: [schema.spendIntents.assignmentId, schema.spendIntents.idempotencyKey] }).returning();
        if (row) {
          await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "agent", actorId: input.agentId, eventType: "intent_created", subjectType: "spend_intent", subjectId: row.id, metadataJson: { assignmentId: row.assignmentId, walletId: row.walletId } });
        }
        return [row] as const;
      });
    } catch (error) {
      const providerError = error as { code?: string; constraint?: string; constraint_name?: string; cause?: { code?: string; constraint?: string; constraint_name?: string } };
      const code = providerError.code ?? providerError.cause?.code;
      const constraint = providerError.constraint ?? providerError.constraint_name ?? providerError.cause?.constraint ?? providerError.cause?.constraint_name;
      if (code !== "23505" || !constraint?.includes("purpose_tag")) throw error;
    }
    if (created) return { kind: "created" as const, intent: created };
    const [existing] = await this.db.select().from(schema.spendIntents).where(and(eq(schema.spendIntents.organizationId, input.organizationId), eq(schema.spendIntents.assignmentId, input.assignmentId), eq(schema.spendIntents.idempotencyKey, input.idempotencyKey))).limit(1);
    if (!existing) {
      const [purpose] = await this.db.select().from(schema.spendIntents).where(and(eq(schema.spendIntents.organizationId, input.organizationId), eq(schema.spendIntents.purposeTag, input.purposeTag))).limit(1);
      if (purpose) {
        if (purpose.assignmentId === input.assignmentId && purpose.idempotencyKey === input.idempotencyKey && purpose.requestHash === input.requestHash) return { kind: "existing" as const, intent: purpose };
        throw new DbDomainError("PURPOSE_TAG_CONFLICT", "purpose tag is already bound to another intent");
      }
      throw new DbDomainError("IDEMPOTENCY_CONFLICT", "idempotency conflict has no stored intent");
    }
    if (existing.requestHash !== input.requestHash) return { kind: "conflict" as const, intent: existing, error: new DbDomainError("IDEMPOTENCY_KEY_REUSED", "idempotency key was reused with different content", { existingRequestHash: existing.requestHash }) };
    return { kind: "existing" as const, intent: existing };
  }

  async transition(id: string, expectedState: IntentState, expectedVersion: number, nextState: IntentState, details: IntentTransitionDetails) {
    return withSerializationRetry(() => this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(schema.spendIntents).where(and(eq(schema.spendIntents.id, id), eq(schema.spendIntents.organizationId, details.organizationId))).for("update");
      if (!current || current.state !== expectedState || current.stateVersion !== expectedVersion) return null;
      try {
        transitionIntent(expectedState, nextState, details.guard, { intentId: id, expectedPurposeTag: current.purposeTag });
      } catch (error) {
        throw new DbDomainError("INVALID_INTENT_TRANSITION", "intent transition guard rejected the requested state change", error);
      }
      if (nextState !== "received" && nextState !== "failed" && nextState !== "expired" && !hasCompletePolicySnapshot(current)) throw new DbDomainError("POLICY_SNAPSHOT_REQUIRED", "operational intent transitions require a complete stored policy snapshot");
      if ((nextState === "submitted" || nextState === "confirmed") && !details.txDigest && !details.receiptId) throw new DbDomainError("CHAIN_PROOF_REQUIRED", "chain transitions require a transaction or receipt reference");
      if (nextState === "failed" && (expectedState === "submitted" || expectedState === "submission_unknown") && !details.txDigest) throw new DbDomainError("CHAIN_FAILURE_PROOF_REQUIRED", "submitted failure requires a transaction digest");
      const [clock] = await tx.execute(sql`select transaction_timestamp() as now`) as unknown as [{ now: string | Date }];
      if (!clock?.now) throw new DbDomainError("DB_CLOCK_UNAVAILABLE", "database clock is unavailable");
      const now = new Date(clock.now);
      const [updated] = await tx.update(schema.spendIntents).set({
        state: nextState,
        stateVersion: expectedVersion + 1,
        ...(details.outcome ? { outcome: details.outcome } : {}),
        ...(details.failureCode ? { failureCode: details.failureCode } : {}),
        ...(details.failureDetail ? { failureDetail: details.failureDetail } : {}),
        ...(details.txDigest ? { txDigest: details.txDigest } : {}),
        ...(details.receiptId ? { receiptId: details.receiptId } : {}),
        ...(nextState === "submitted" ? { submittedAt: now } : {}),
        ...(nextState === "confirmed" ? { confirmedAt: now } : {}),
        ...(nextState === "confirmed" || nextState === "failed" || nextState === "blocked" ? { completedAt: now } : {}),
        updatedAt: now,
      }).where(and(eq(schema.spendIntents.id, id), eq(schema.spendIntents.organizationId, details.organizationId), eq(schema.spendIntents.state, expectedState), eq(schema.spendIntents.stateVersion, expectedVersion))).returning();
      if (!updated) return null;
      await appendAuditEvent(tx, { organizationId: details.organizationId, actorType: "system", actorId: details.actorId ?? null, eventType: `intent_${nextState}`, subjectType: "spend_intent", subjectId: id, metadataJson: { from: expectedState, to: nextState, stateVersion: expectedVersion + 1 } });
      return updated;
    }));
  }

  async byId(organizationId: string, id: string) {
    const [intent] = await this.db.select().from(schema.spendIntents).where(and(eq(schema.spendIntents.organizationId, organizationId), eq(schema.spendIntents.id, id))).limit(1);
    return intent ?? null;
  }

  async byCredential(credentialId: string, id: string) {
    const [intent] = await this.db.select().from(schema.spendIntents).where(and(eq(schema.spendIntents.credentialId, credentialId), eq(schema.spendIntents.id, id))).limit(1);
    return intent ?? null;
  }

  async reservationFor(organizationId: string, intentId: string) {
    const [reservation] = await this.db.select().from(schema.budgetReservations).where(and(eq(schema.budgetReservations.organizationId, organizationId), eq(schema.budgetReservations.intentId, intentId))).limit(1);
    return reservation ?? null;
  }

  async completeSimulation(input: { organizationId: string; intentId: string; expectedVersion: number; simulationJson: Record<string, unknown>; simulationHash: string; riskScore: number; recommendation: string; blocked: boolean; abortReason?: string }) {
    return withSerializationRetry(() => this.db.transaction(async (tx) => {
      const [clock] = await tx.execute(sql`select transaction_timestamp() as now`) as unknown as [{ now: string | Date }];
      if (!clock?.now) throw new DbDomainError("DB_CLOCK_UNAVAILABLE", "database clock is unavailable");
      const now = new Date(clock.now);
      const [intent] = await tx.select().from(schema.spendIntents).where(and(eq(schema.spendIntents.organizationId, input.organizationId), eq(schema.spendIntents.id, input.intentId), eq(schema.spendIntents.state, "simulating"), eq(schema.spendIntents.stateVersion, input.expectedVersion))).for("update");
      if (!intent) return null;
      const nextState = input.blocked ? "simulation_blocked" : "evidence_pending";
      transitionIntent("simulating", nextState);
      if (input.blocked) await releaseReservationForBlockedSimulation(tx, intent, now);
      const [updated] = await tx.update(schema.spendIntents).set({ simulationJson: input.simulationJson, simulationHash: input.simulationHash, riskScore: input.riskScore, recommendation: input.recommendation, simulatedAt: now, abortReason: input.abortReason, state: nextState, stateVersion: input.expectedVersion + 1, updatedAt: now }).where(and(eq(schema.spendIntents.id, intent.id), eq(schema.spendIntents.organizationId, input.organizationId), eq(schema.spendIntents.state, "simulating"), eq(schema.spendIntents.stateVersion, input.expectedVersion))).returning();
      if (!updated) throw new DbDomainError("INTENT_TRANSITION_RACE", "simulation result lost a state race");
      await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "system", actorId: null, eventType: `intent_${nextState}`, subjectType: "spend_intent", subjectId: intent.id, metadataJson: { from: "simulating", to: nextState, stateVersion: updated.stateVersion } });
      return updated;
    }));
  }

  async recordEvidenceFailure(input: { organizationId: string; intentId: string; code: string }) {
    const [updated] = await this.db.update(schema.spendIntents).set({ evidenceAttempts: sql`${schema.spendIntents.evidenceAttempts} + 1`, evidenceLastError: input.code, updatedAt: new Date() }).where(and(eq(schema.spendIntents.organizationId, input.organizationId), eq(schema.spendIntents.id, input.intentId), eq(schema.spendIntents.state, "evidence_pending"))).returning();
    return updated ?? null;
  }

  async publishEvidence(input: { organizationId: string; intentId: string; expectedVersion: number; blobId: string; evidenceHash: string }) {
    if (input.blobId.startsWith("local:")) throw new DbDomainError("LOCAL_EVIDENCE_NOT_ALLOWED", "hosted evidence cannot be local");
    return this.db.transaction(async (tx) => {
      const [updated] = await tx.update(schema.spendIntents).set({ evidenceState: "published", evidenceBlobId: input.blobId, evidenceHash: input.evidenceHash, evidenceAttempts: sql`${schema.spendIntents.evidenceAttempts} + 1`, evidenceLastError: null, state: "evidence_published", stateVersion: input.expectedVersion + 1, updatedAt: new Date() }).where(and(eq(schema.spendIntents.organizationId, input.organizationId), eq(schema.spendIntents.id, input.intentId), eq(schema.spendIntents.state, "evidence_pending"), eq(schema.spendIntents.stateVersion, input.expectedVersion))).returning();
      if (updated) await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "system", actorId: null, eventType: "intent_evidence_published", subjectType: "spend_intent", subjectId: input.intentId, metadataJson: { from: "evidence_pending", to: "evidence_published", stateVersion: updated.stateVersion } });
      return updated ?? null;
    });
  }

  async blockForBudget(input: { organizationId: string; intentId: string; failureCode: string }) {
    return this.db.transaction(async (tx) => {
      const [intent] = await tx.select().from(schema.spendIntents).where(and(eq(schema.spendIntents.organizationId, input.organizationId), eq(schema.spendIntents.id, input.intentId), eq(schema.spendIntents.state, "received"))).for("update");
      if (!intent) return null;
      const walletPolicy = await activePolicy(tx, input.organizationId, "wallet", intent.walletId);
      const assignmentPolicy = await activePolicy(tx, input.organizationId, "assignment", intent.assignmentId);
      if (!walletPolicy || !assignmentPolicy) throw new DbDomainError("NO_ACTIVE_POLICY", "both active policies are required");
      const resolved = resolveActivePolicies({ walletPolicy: toPolicyVersion(walletPolicy), assignmentPolicy: toPolicyVersion(assignmentPolicy) });
      const [updated] = await tx.update(schema.spendIntents).set({ walletPolicyVersionId: walletPolicy.id, walletPolicyHash: walletPolicy.policyHash, assignmentPolicyVersionId: assignmentPolicy.id, assignmentPolicyHash: assignmentPolicy.policyHash, effectivePolicyHash: resolved.snapshot.effectivePolicyHash, policySnapshotJson: JSON.parse(resolved.snapshotJson), abortReason: input.failureCode, state: "policy_blocked", stateVersion: intent.stateVersion + 1, updatedAt: new Date() }).where(and(eq(schema.spendIntents.id, intent.id), eq(schema.spendIntents.state, "received"), eq(schema.spendIntents.stateVersion, intent.stateVersion))).returning();
      if (updated) await appendAuditEvent(tx, { organizationId: input.organizationId, actorType: "system", actorId: null, eventType: "intent_policy_blocked", subjectType: "spend_intent", subjectId: intent.id, metadataJson: { effectivePolicyHash: resolved.snapshot.effectivePolicyHash, state: input.failureCode } });
      return updated ?? null;
    });
  }

  async recordChainReference(organizationId: string, intentId: string, txDigest: string) {
    const [intent] = await this.db.update(schema.spendIntents).set({ txDigest, updatedAt: new Date() }).where(and(eq(schema.spendIntents.organizationId, organizationId), eq(schema.spendIntents.id, intentId))).returning();
    return intent ?? null;
  }

  async recoverable(limit = 50) {
    return this.db.select().from(schema.spendIntents).where(inArray(schema.spendIntents.state, ["evidence_pending", "abort_record_pending", "submitted", "submission_unknown"])).orderBy(schema.spendIntents.createdAt).limit(Math.min(Math.max(limit, 1), 100));
  }
}

async function activePolicy(tx: Parameters<Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0]>[0], organizationId: string, scopeType: "wallet" | "assignment", subjectId: string) {
  const [row] = await tx.select({ policy: schema.policyVersions }).from(schema.policyScopes).innerJoin(schema.policyVersions, and(eq(schema.policyVersions.id, schema.policyScopes.currentVersionId), eq(schema.policyVersions.status, "active"))).where(and(eq(schema.policyScopes.organizationId, organizationId), eq(schema.policyScopes.scopeType, scopeType), scopeType === "wallet" ? eq(schema.policyScopes.walletId, subjectId) : eq(schema.policyScopes.assignmentId, subjectId))).limit(1);
  return row?.policy ?? null;
}

function toPolicyVersion(policy: typeof schema.policyVersions.$inferSelect): PolicyVersionInput {
  return { id: policy.id, scopeId: policy.scopeId, version: policy.version, status: policy.status, canonicalJson: policy.canonicalJson, policyHash: policy.policyHash };
}

async function releaseReservationForBlockedSimulation(tx: Parameters<Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0]>[0], intent: typeof schema.spendIntents.$inferSelect, now: Date) {
  const [reservation] = await tx.select().from(schema.budgetReservations).where(and(eq(schema.budgetReservations.organizationId, intent.organizationId), eq(schema.budgetReservations.intentId, intent.id), eq(schema.budgetReservations.state, "active"))).for("update");
  if (!reservation) throw new DbDomainError("RESERVATION_MISSING", "simulation block has no active reservation");
  for (const periodKind of ["day", "month"] as const) {
    const periodStart = periodKind === "day" ? new Date(Date.UTC(reservation.createdAt.getUTCFullYear(), reservation.createdAt.getUTCMonth(), reservation.createdAt.getUTCDate())) : new Date(Date.UTC(reservation.createdAt.getUTCFullYear(), reservation.createdAt.getUTCMonth(), 1));
    await tx.update(schema.walletBudgetCounters).set({ reservedMist: sql`${schema.walletBudgetCounters.reservedMist} - ${reservation.amountMist}`, updatedAt: now }).where(and(eq(schema.walletBudgetCounters.walletId, reservation.walletId), eq(schema.walletBudgetCounters.periodKind, periodKind), eq(schema.walletBudgetCounters.periodStart, periodStart)));
    await tx.update(schema.assignmentBudgetCounters).set({ reservedMist: sql`${schema.assignmentBudgetCounters.reservedMist} - ${reservation.amountMist}`, updatedAt: now }).where(and(eq(schema.assignmentBudgetCounters.assignmentId, reservation.assignmentId), eq(schema.assignmentBudgetCounters.periodKind, periodKind), eq(schema.assignmentBudgetCounters.periodStart, periodStart)));
  }
  await tx.update(schema.budgetReservations).set({ state: "released", updatedAt: now }).where(eq(schema.budgetReservations.id, reservation.id));
}

function hasCompletePolicySnapshot(intent: typeof schema.spendIntents.$inferSelect): boolean {
  return intent.policySnapshotJson !== null
    && intent.walletPolicyVersionId !== null
    && intent.walletPolicyHash !== null
    && intent.assignmentPolicyVersionId !== null
    && intent.assignmentPolicyHash !== null
    && intent.effectivePolicyHash !== null;
}

const REASONING_KEYS = new Set(["prompt", "decision", "model", "metadata"]);
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function validateReasoningJson(value: unknown): void {
  const seen = new Set<object>();
  const visit = (current: unknown, topLevel: boolean): void => {
    if (current === null || typeof current === "string" || typeof current === "boolean") return;
    if (typeof current === "number" && Number.isFinite(current)) return;
    if (typeof current !== "object" || typeof current === "bigint" || current === undefined) throw new DbDomainError("INVALID_REASONING", "reasoning must contain only JSON values");
    if (seen.has(current)) throw new DbDomainError("INVALID_REASONING", "reasoning cannot contain cycles");
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null && !Array.isArray(current)) throw new DbDomainError("INVALID_REASONING", "reasoning must contain plain JSON objects");
    if (Object.getOwnPropertySymbols(current).length > 0) throw new DbDomainError("INVALID_REASONING", "reasoning cannot contain symbol keys");
    seen.add(current);
    try {
      for (const key of Object.keys(current)) {
        if (DANGEROUS_KEYS.has(key) || (topLevel && !REASONING_KEYS.has(key))) throw new DbDomainError("INVALID_REASONING", "reasoning contains an unsupported key");
        visit((current as Record<string, unknown>)[key], false);
      }
    } finally {
      seen.delete(current);
    }
  };
  visit(value, true);
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch (error) {
    throw new DbDomainError("INVALID_REASONING", "reasoning cannot be serialized", error);
  }
  if (!encoded || Buffer.byteLength(encoded, "utf8") >= 16_384) throw new DbDomainError("INVALID_REASONING", "reasoning exceeds its size bound");
}
