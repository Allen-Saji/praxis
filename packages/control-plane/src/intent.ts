import { canonicalJson, hashCanonical, toCanonicalPolicyDocument } from "./canonical";
import { DomainError } from "./errors";
import type { PolicySnapshot } from "./policy";
import { parseMist, U64_MAX } from "./validation";

export type IntentState =
  | "received"
  | "policy_blocked"
  | "reserved"
  | "simulating"
  | "simulation_blocked"
  | "evidence_pending"
  | "evidence_published"
  | "signing"
  | "submitted"
  | "submission_unknown"
  | "confirmed"
  | "abort_record_pending"
  | "blocked"
  | "failed"
  | "expired";

const TRANSITIONS: Record<IntentState, readonly IntentState[]> = {
  received: ["policy_blocked", "reserved", "failed"],
  policy_blocked: ["evidence_pending"],
  reserved: ["simulating", "expired"],
  simulating: ["simulation_blocked", "evidence_pending", "failed"],
  simulation_blocked: ["evidence_pending"],
  evidence_pending: ["evidence_published", "failed"],
  evidence_published: ["signing", "abort_record_pending", "failed"],
  signing: ["submitted", "failed", "submission_unknown"],
  submitted: ["confirmed", "submission_unknown", "failed"],
  submission_unknown: ["submitted", "confirmed", "failed"],
  abort_record_pending: ["blocked"],
  confirmed: [],
  blocked: [],
  failed: [],
  expired: [],
};

export type EvidenceFailureProof = { kind: "evidence_failure"; errorCode: string; noSignature: true };

/**
 * Reconciliation must be backed by positive evidence.  A retry count or an
 * elapsed timeout is not evidence that a submission did not execute.
 */
export type ReconciliationEvidence =
  | { kind: "chain_scan"; intentId: string; purposeTag: string; finalizedCheckpoint: string; finalized: true }
  | { kind: "operator_review"; intentId: string; purposeTag: string; reviewId: string };

export type ReconciliationResult =
  | { kind: "submitted"; outcome: "submitted"; txDigest: string; checkedAt: Date; evidence: ReconciliationEvidence }
  | { kind: "confirmed"; outcome: "confirmed"; txDigest: string; checkedAt: Date; receiptId?: string; evidence: ReconciliationEvidence }
  | { kind: "definite_failure"; outcome: "failed"; failureCode: string; txDigest: string; checkedAt: Date; evidence: ReconciliationEvidence }
  | { kind: "no_success"; outcome: "not_found"; checkedAt: Date; evidence: ReconciliationEvidence };

export type TransitionGuard = EvidenceFailureProof | ReconciliationResult;

function validCheckedAt(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && /^[A-Za-z0-9:_-]+$/.test(value);
}

function validPurposeTag(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function validReconciliationEvidence(value: unknown): value is ReconciliationEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Record<string, unknown>;
  if (!validString(evidence.intentId) || !validPurposeTag(evidence.purposeTag)) return false;
  if (evidence.kind === "chain_scan") {
    return validPurposeTag(evidence.purposeTag) && validDigest(evidence.finalizedCheckpoint) && evidence.finalized === true;
  }
  return evidence.kind === "operator_review" && typeof evidence.reviewId === "string" && evidence.reviewId.length > 0;
}

function validString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export type IntentTransitionContext = { intentId: string; expectedPurposeTag?: string; purposeTag?: string };

function validTransitionContext(value: unknown): value is IntentTransitionContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  const expectedPurposeTag = context.expectedPurposeTag ?? context.purposeTag;
  return validString(context.intentId) && validPurposeTag(expectedPurposeTag) && (context.purposeTag === undefined || context.purposeTag === expectedPurposeTag);
}

function purposeTagOf(context: IntentTransitionContext): string {
  return (context.expectedPurposeTag ?? context.purposeTag) as string;
}

function splitTransitionArgs(
  guardOrContext: TransitionGuard | IntentTransitionContext | undefined,
  contextOrGuard: IntentTransitionContext | TransitionGuard | undefined,
): { guard: TransitionGuard | undefined; context: IntentTransitionContext | undefined } {
  if (guardOrContext && typeof guardOrContext === "object" && ("expectedPurposeTag" in guardOrContext || "purposeTag" in guardOrContext) && !((guardOrContext as unknown as ReconciliationResult).kind)) {
    return { guard: contextOrGuard as TransitionGuard | undefined, context: guardOrContext };
  }
  return { guard: guardOrContext as TransitionGuard | undefined, context: contextOrGuard as IntentTransitionContext | undefined };
}

function isEvidenceFailureProof(guard: TransitionGuard | undefined): guard is EvidenceFailureProof {
  return !!guard && guard.kind === "evidence_failure" && typeof guard.errorCode === "string" && guard.errorCode.length > 0 && guard.noSignature === true;
}

function isReconciliationResult(guard: TransitionGuard | undefined): guard is ReconciliationResult {
  if (!guard || !("outcome" in guard) || !validCheckedAt(guard.checkedAt)) return false;
  if (!validReconciliationEvidence(guard.evidence)) return false;
  if (guard.kind === "submitted") return guard.outcome === "submitted" && validDigest(guard.txDigest);
  if (guard.kind === "confirmed") return guard.outcome === "confirmed" && validDigest(guard.txDigest) && (guard.receiptId === undefined || validDigest(guard.receiptId));
  if (guard.kind === "definite_failure") return guard.outcome === "failed" && typeof guard.failureCode === "string" && guard.failureCode.length > 0 && validDigest(guard.txDigest);
  return guard.kind === "no_success" && guard.outcome === "not_found";
}

function hasEvidenceFailureProof(guard: TransitionGuard | undefined): boolean {
  return isEvidenceFailureProof(guard);
}

function hasReconciliationOutcome(guard: TransitionGuard | undefined, outcome: ReconciliationResult["outcome"], context: IntentTransitionContext | undefined): boolean {
  return isReconciliationResult(guard) && validTransitionContext(context) && guard.outcome === outcome && guard.evidence.intentId === context.intentId && guard.evidence.purposeTag === purposeTagOf(context);
}

export function canTransitionIntent(current: IntentState, next: IntentState, guardOrContext?: TransitionGuard | IntentTransitionContext, contextOrGuard?: IntentTransitionContext | TransitionGuard): boolean {
  const { guard, context } = splitTransitionArgs(guardOrContext, contextOrGuard);
  if (!TRANSITIONS[current]?.includes(next)) return false;
  if ((current === "evidence_pending" || current === "evidence_published") && next === "failed") return hasEvidenceFailureProof(guard);
  if (current === "submitted" && next === "failed") return hasReconciliationOutcome(guard, "failed", context);
  if (current === "submitted" && next === "confirmed") return hasReconciliationOutcome(guard, "confirmed", context);
  if (current === "submission_unknown" && next === "submitted") return hasReconciliationOutcome(guard, "submitted", context);
  if (current === "submission_unknown" && next === "confirmed") return hasReconciliationOutcome(guard, "confirmed", context);
  if (current === "submission_unknown" && next === "failed") return hasReconciliationOutcome(guard, "failed", context) || hasReconciliationOutcome(guard, "not_found", context);
  return true;
}

export function transitionIntent(current: IntentState, next: IntentState, guardOrContext?: TransitionGuard | IntentTransitionContext, contextOrGuard?: IntentTransitionContext | TransitionGuard): IntentState {
  const { guard, context } = splitTransitionArgs(guardOrContext, contextOrGuard);
  if (!TRANSITIONS[current]?.includes(next)) throw new DomainError("INVALID_INTENT_TRANSITION");
  if ((current === "evidence_pending" || current === "evidence_published") && next === "failed" && !hasEvidenceFailureProof(guard)) {
    throw new DomainError("INVALID_INTENT_TRANSITION", "proof that no signature occurred is required");
  }
  if (current === "submitted" && next === "failed" && !hasReconciliationOutcome(guard, "failed", context)) {
    throw new DomainError("INVALID_INTENT_TRANSITION", "definite execution failure proof is required");
  }
  if (current === "submitted" && next === "confirmed" && !hasReconciliationOutcome(guard, "confirmed", context)) {
    throw new DomainError("INVALID_INTENT_TRANSITION", "confirmed reconciliation result is required");
  }
  if (current === "submission_unknown" && next === "submitted" && !hasReconciliationOutcome(guard, "submitted", context)) {
    throw new DomainError("INVALID_INTENT_TRANSITION", "submitted reconciliation result is required");
  }
  if (current === "submission_unknown" && next === "confirmed" && !hasReconciliationOutcome(guard, "confirmed", context)) {
    throw new DomainError("INVALID_INTENT_TRANSITION", "confirmed reconciliation result is required");
  }
  if (current === "submission_unknown" && next === "failed" && !hasReconciliationOutcome(guard, "failed", context) && !hasReconciliationOutcome(guard, "not_found", context)) {
    throw new DomainError("INVALID_INTENT_TRANSITION", "reconciliation result is required");
  }
  return next;
}

export type IntentRecord = { state: IntentState; stateVersion: number };
export function transitionIntentRecord(record: IntentRecord, next: IntentState, guardOrContext?: TransitionGuard | IntentTransitionContext, contextOrGuard?: IntentTransitionContext | TransitionGuard): IntentRecord {
  transitionIntent(record.state, next, guardOrContext, contextOrGuard);
  return { state: next, stateVersion: record.stateVersion + 1 };
}

export function utcPeriods(at: Date): { day: Date; month: Date } {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) throw new DomainError("INVALID_CANONICAL_VALUE", "time must be a valid date");
  return {
    day: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())),
    month: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)),
  };
}

export const utcPeriodStarts = utcPeriods;

export function nextUtcDay(at: Date): Date {
  return new Date(utcPeriods(at).day.getTime() + 86_400_000);
}

export function nextUtcMonth(at: Date): Date {
  const period = utcPeriods(at).month;
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));
}

export type PreSignEntityStatus = "active" | "enabled" | "disabled" | "revoked" | "expired" | "archived" | "suspended";

export type PreSignReservation = {
  id: string;
  organizationId: string;
  intentId: string;
  walletId: string;
  assignmentId: string;
  amountMist: bigint | string;
  state: "active" | "committed" | "released" | "expired";
  expiresAt: Date;
};

export type PreSignExecutionLease = {
  id: string;
  organizationId: string;
  intentId: string;
  walletId: string;
  workerId?: string;
  ownerId?: string;
  state: "active" | "released" | "expired";
  expiresAt: Date;
};

export type PreSignExecutionBindings = {
  organizationId: string;
  intent: { id: string; organizationId: string; assignmentId: string; walletId: string; agentId: string; credentialId: string; amountMist: bigint | string };
  wallet: { id: string; organizationId: string };
  agent: { id: string; organizationId: string };
  assignment: { id: string; organizationId: string; walletId: string; agentId: string };
  credential: { id: string; organizationId: string; assignmentId: string };
  reservation: { id: string; organizationId: string; intentId: string; walletId: string; assignmentId: string; amountMist: bigint | string };
  executionLease: { id: string; organizationId: string; intentId: string; walletId: string; workerId?: string; ownerId?: string };
};

/** Authoritative tenant-scoped snapshot loaded immediately before signing. */
export type PreSignExecutionContext = {
  organizationId: string;
  intent: { id: string; organizationId: string; assignmentId: string; walletId: string; agentId: string; credentialId: string; amountMist: bigint | string; state: IntentState };
  wallet: { id: string; organizationId: string; status: PreSignEntityStatus; archivedAt: Date | null };
  agent: { id: string; organizationId: string; status: PreSignEntityStatus };
  assignment: { id: string; organizationId: string; walletId: string; agentId: string; status: PreSignEntityStatus };
  credential: { id: string; organizationId: string; assignmentId: string; status: PreSignEntityStatus; expiresAt: Date | null };
  policySnapshot: PolicySnapshot;
  reservation: PreSignReservation | null;
  executionLease: PreSignExecutionLease | null;
};

/**
 * All fields are optional at the type boundary so adapters can deserialize
 * untrusted data.  The implementation below requires every field before it
 * can return success; omission is therefore a hard block, not an implicit
 * default.
 */
export type PreSignRevalidationInput = {
  organizationId?: string;
  bindings?: PreSignExecutionBindings;
  expectedSnapshot?: PolicySnapshot;
  currentSnapshot?: PolicySnapshot;
  expectedPolicySnapshot?: PolicySnapshot;
  currentPolicySnapshot?: PolicySnapshot;
  expected?: { walletId?: string; assignmentId?: string; agentId?: string; credentialId?: string; snapshot?: PolicySnapshot };
  current?: { walletId?: string; assignmentId?: string; agentId?: string; credentialId?: string; snapshot?: PolicySnapshot };
  expectedWalletId?: string;
  currentWalletId?: string;
  expectedAssignmentId?: string;
  currentAssignmentId?: string;
  expectedAgentId?: string;
  currentAgentId?: string;
  expectedCredentialId?: string;
  currentCredentialId?: string;
  walletId?: string;
  assignmentId?: string;
  agentId?: string;
  credentialId?: string;
  walletStatus?: PreSignEntityStatus;
  agentStatus?: PreSignEntityStatus;
  assignmentStatus?: PreSignEntityStatus;
  credentialStatus?: PreSignEntityStatus;
  walletArchivedAt?: Date | null;
  reservationState?: "active" | "committed" | "released" | "expired";
  reservation?: PreSignReservation | null;
  executionLease?: PreSignExecutionLease | null;
  lease?: PreSignExecutionLease | null;
  intentId?: string;
  amountMist?: bigint | string;
  workerId?: string;
  intentState?: IntentState;
  credentialExpiresAt?: Date | null;
  now?: Date;
};

function mismatch(): never {
  throw new DomainError("PRESIGN_REVALIDATION_FAILED");
}

function expectedSnapshotOf(input: PreSignRevalidationInput): PolicySnapshot | undefined {
  return input.expectedSnapshot ?? input.expectedPolicySnapshot ?? input.expected?.snapshot;
}

function currentSnapshotOf(input: PreSignRevalidationInput): PolicySnapshot | undefined {
  return input.currentSnapshot ?? input.currentPolicySnapshot ?? input.current?.snapshot;
}

function equalSnapshot(left: PolicySnapshot, right: PolicySnapshot): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function validSnapshotEntry(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  const keys = Object.keys(entry).sort();
  if (keys.join(",") !== "policy,policyHash,version,versionId") return false;
  if (typeof entry.versionId !== "string" || entry.versionId.length === 0 || !Number.isInteger(entry.version) || (entry.version as number) < 1) return false;
  if (typeof entry.policyHash !== "string" || !/^[0-9a-f]{64}$/.test(entry.policyHash)) return false;
  try {
    const document = toCanonicalPolicyDocument(entry.policy as never);
    return canonicalJson(document) === canonicalJson(entry.policy) && hashCanonical(document) === entry.policyHash;
  } catch {
    return false;
  }
}

function validSnapshot(value: unknown): value is PolicySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return validSnapshotEntry(snapshot.wallet) && validSnapshotEntry(snapshot.assignment) && typeof snapshot.effectivePolicyHash === "string" && /^[0-9a-f]{64}$/.test(snapshot.effectivePolicyHash);
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) mismatch();
  return value;
}

function requiredDate(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) mismatch();
  return value;
}

function requiredCredentialExpiry(value: unknown): Date | null {
  if (value === null) return null;
  return requiredDate(value);
}

function requiredAmount(value: unknown): bigint {
  if (typeof value === "bigint") {
    if (value <= 0n || value > U64_MAX) mismatch();
    return value;
  }
  try {
    return parseMist(value);
  } catch {
    mismatch();
  }
}

/**
 * Pure gate used immediately before signing.  Callers supply freshly loaded
 * status and policy values; this helper deliberately knows nothing about a
 * database, framework, or transport.
 */
export function revalidateBeforeSigning(input: PreSignRevalidationInput): { ok: true } {
  const expected = expectedSnapshotOf(input);
  const current = currentSnapshotOf(input);
  if (!expected || !current || !validSnapshot(expected) || !validSnapshot(current) || !equalSnapshot(expected, current)) mismatch();

  const now = requiredDate(input.now);
  const intentId = requiredString(input.intentId);
  const amountMist = requiredAmount(input.amountMist);
  const walletId = requiredString(input.walletId);
  const assignmentId = requiredString(input.assignmentId);
  const agentId = requiredString(input.agentId);
  const credentialId = requiredString(input.credentialId);
  const workerId = requiredString(input.workerId);
  const bindings = input.bindings;
  if (!bindings || !bindings.intent || !bindings.wallet || !bindings.agent || !bindings.assignment || !bindings.credential || !bindings.reservation || !bindings.executionLease) mismatch();
  const organizationId = requiredString(input.organizationId);
  if (requiredString(bindings.organizationId) !== organizationId) mismatch();
  if (requiredString(bindings.intent.organizationId) !== organizationId || requiredString(bindings.wallet.organizationId) !== organizationId || requiredString(bindings.agent.organizationId) !== organizationId || requiredString(bindings.assignment.organizationId) !== organizationId || requiredString(bindings.credential.organizationId) !== organizationId || requiredString(bindings.reservation.organizationId) !== organizationId || requiredString(bindings.executionLease.organizationId) !== organizationId) mismatch();
  if (requiredString(bindings.intent.id) !== intentId || requiredString(bindings.intent.assignmentId) !== assignmentId || requiredString(bindings.intent.walletId) !== walletId || requiredString(bindings.intent.agentId) !== agentId || requiredString(bindings.intent.credentialId) !== credentialId || requiredAmount(bindings.intent.amountMist) !== amountMist) mismatch();
  if (requiredString(bindings.wallet.id) !== walletId || requiredString(bindings.agent.id) !== agentId || requiredString(bindings.assignment.id) !== assignmentId || requiredString(bindings.credential.id) !== credentialId) mismatch();
  if (requiredString(bindings.assignment.walletId) !== walletId || requiredString(bindings.assignment.agentId) !== agentId || requiredString(bindings.credential.assignmentId) !== assignmentId) mismatch();
  const identity = { walletId, assignmentId, agentId, credentialId };
  for (const key of Object.keys(identity) as Array<keyof typeof identity>) {
    const expectedValue = input.expected?.[key];
    const currentValue = input.current?.[key];
    if ((expectedValue !== undefined && expectedValue !== identity[key]) || (currentValue !== undefined && currentValue !== identity[key])) mismatch();
  }
  if (input.walletStatus !== "enabled") mismatch();
  if (input.agentStatus !== "active" || input.assignmentStatus !== "active" || input.credentialStatus !== "active") mismatch();
  if (input.walletArchivedAt !== null) mismatch();
  if (input.credentialExpiresAt === undefined) mismatch();
  const credentialExpiresAt = requiredCredentialExpiry(input.credentialExpiresAt);
  if (credentialExpiresAt !== null && credentialExpiresAt <= now) mismatch();
  if (input.intentState !== "evidence_published") mismatch();

  const reservation = input.reservation;
  if (!reservation || reservation.state !== "active") mismatch();
  if (requiredString(reservation.id) !== reservation.id || requiredString(reservation.intentId) !== intentId || requiredString(reservation.walletId) !== walletId || requiredString(reservation.assignmentId) !== assignmentId) mismatch();
  if (requiredAmount(reservation.amountMist) !== amountMist) mismatch();
  if (requiredString(bindings.reservation.id) !== reservation.id || requiredString(bindings.reservation.intentId) !== reservation.intentId || requiredString(bindings.reservation.walletId) !== reservation.walletId || requiredString(bindings.reservation.assignmentId) !== reservation.assignmentId || requiredAmount(bindings.reservation.amountMist) !== amountMist) mismatch();
  if (requiredDate(reservation.expiresAt) <= now) mismatch();

  const lease = input.executionLease ?? input.lease;
  if (!lease || lease.state !== "active") mismatch();
  if (requiredString(lease.id) !== lease.id || requiredString(lease.intentId) !== intentId || requiredString(lease.walletId) !== walletId) mismatch();
  if (lease.workerId !== undefined && lease.ownerId !== undefined && lease.workerId !== lease.ownerId) mismatch();
  const leaseOwner = lease.workerId ?? lease.ownerId;
  if (requiredString(leaseOwner) !== workerId || requiredDate(lease.expiresAt) <= now) mismatch();
  if (requiredString(bindings.executionLease.id) !== lease.id || requiredString(bindings.executionLease.intentId) !== lease.intentId || requiredString(bindings.executionLease.walletId) !== lease.walletId) mismatch();
  if (bindings.executionLease.workerId !== undefined && bindings.executionLease.ownerId !== undefined && bindings.executionLease.workerId !== bindings.executionLease.ownerId) mismatch();
  if (requiredString(bindings.executionLease.workerId ?? bindings.executionLease.ownerId) !== workerId) mismatch();

  for (const [key, expectedValue] of Object.entries(input.expected ?? {})) {
    if (key === "snapshot" || expectedValue === undefined) continue;
    const currentValue = input.current?.[key as "walletId" | "assignmentId" | "agentId" | "credentialId"];
    if (currentValue !== expectedValue) mismatch();
  }
  for (const subject of ["Wallet", "Assignment", "Agent", "Credential"] as const) {
    const expectedValue = input[`expected${subject}Id`];
    const currentValue = input[`current${subject}Id`];
    if (expectedValue !== undefined && currentValue !== expectedValue) mismatch();
  }
  return { ok: true };
}

export const preSignRevalidate = revalidateBeforeSigning;
export const assertPreSignRevalidation = revalidateBeforeSigning;
export const revalidateExecution = revalidateBeforeSigning;
export const validateIntentTransition = transitionIntent;
