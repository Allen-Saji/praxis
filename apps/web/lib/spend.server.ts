import "server-only";
import { createHash } from "node:crypto";
import { hashCanonical, normalizeSuiAddress, parseMist, stablePurposeTag, type PolicySnapshot } from "@allen-saji/praxis-control-plane";
import { BudgetLimitError, DbDomainError } from "@allen-saji/praxis-db";
import { DEPLOYMENTS, KeypairAdapter, PraxisSdkError, WALRUS_ENDPOINTS, WalrusStore, buildReasoningEvidence, buildSuiTransferTransaction, executeApprovedSuiSpend, makeSuiClient, publishEvidence, recordBlockedSuiIntent, simulateSuiTransfer, type EvidencePort, type NormalizedSimulationReport, type SignerPort, type SuiTransport } from "@allen-saji/praxis";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { executionLeaseRepository, intentRepository, reservationRepository, workspaceRepository } from "./control-plane.server";

type Intent = NonNullable<Awaited<ReturnType<ReturnType<typeof intentRepository>["byId"]>>>;
type Runtime = { transport: SuiTransport; signer: SignerPort; evidence: EvidencePort };

export type AgentContext = {
  credential: { id: string };
  assignment: { id: string };
  agent: { id: string };
  wallet: { id: string; suiAddress: string };
  organization: { id: string };
};

export type SpendRequest = { recipient: string; amountMist: string; coinType: "0x2::sui::SUI"; reasoning: { prompt: string; decision: string; model: string; metadata?: Record<string, unknown> }; privacy: "public" };

export async function createAndProcessSpend(input: { context: AgentContext; idempotencyKey: string; request: SpendRequest; runtime?: Runtime }) {
  const request = { ...input.request, recipient: normalizeSuiAddress(input.request.recipient), amountMist: parseMist(input.request.amountMist).toString() };
  const requestHash = hashCanonical(request);
  const purposeTag = stablePurposeTag({ organizationId: input.context.organization.id, assignmentId: input.context.assignment.id, idempotencyKey: input.idempotencyKey, requestHash });
  const intents = intentRepository();
  const created = await intents.createOrLoad({ organizationId: input.context.organization.id, assignmentId: input.context.assignment.id, walletId: input.context.wallet.id, agentId: input.context.agent.id, credentialId: input.context.credential.id, idempotencyKey: input.idempotencyKey, requestHash, purposeTag, recipient: request.recipient, amountMist: BigInt(request.amountMist), reasoningJson: request.reasoning });
  if (created.kind === "conflict") return { kind: "conflict" as const, intent: created.intent };
  const intent = await processSpendIntent(created.intent, input.runtime ?? defaultRuntime(), input.context.wallet.suiAddress);
  return { kind: created.kind, intent };
}

export async function processSpendIntent(initial: Intent, runtime: Runtime, walletAddress?: string): Promise<Intent> {
  const intents = intentRepository();
  const reservations = reservationRepository();
  const leases = executionLeaseRepository();
  let intent = (await intents.byId(initial.organizationId, initial.id)) ?? initial;

  if (intent.state === "received") {
    try {
      const result = await reservations.reserve({ intentId: intent.id, organizationId: intent.organizationId, walletId: intent.walletId, assignmentId: intent.assignmentId, amountMist: BigInt(intent.amountMist), ttlMs: 10 * 60_000, actorId: intent.agentId });
      intent = (await intents.byId(intent.organizationId, intent.id))!;
      if (result.kind === "blocked") intent = result.intent;
    } catch (error) {
      if (!(error instanceof BudgetLimitError)) throw error;
      intent = (await intents.blockForBudget({ organizationId: intent.organizationId, intentId: intent.id, failureCode: `${error.periodKind.toUpperCase()}_BUDGET_EXCEEDED` }))!;
    }
  }

  if (intent.state === "reserved") {
    const simulating = await intents.transition(intent.id, "reserved", intent.stateVersion, "simulating", { organizationId: intent.organizationId });
    if (simulating) intent = simulating;
  }
  if (intent.state === "simulating") {
    let report: NormalizedSimulationReport | null = null;
    try {
      const snapshot = policySnapshot(intent);
      const sender = walletAddress ?? initialWalletAddress(initial, intent);
      report = await retrySimulation(() => simulateSuiTransfer({ transport: runtime.transport, transaction: buildSuiTransferTransaction({ sender, recipient: intent.recipient, amount: BigInt(intent.amountMist) }), sender, recipient: intent.recipient, amount: BigInt(intent.amountMist), policy: toSdkPolicy(snapshot) }));
    } catch (error) {
      const code = error instanceof PraxisSdkError ? error.code : "SIMULATION_FAILED";
      const blockedReport = { success: false, balanceChanges: [], gasEstimate: "0", walletBalance: "0", riskScore: 100, risks: [{ level: "critical", code, message: "Simulation could not be safely completed" }], policyViolations: [], recommendation: "abort", rawEffects: null };
      intent = (await intents.completeSimulation({ organizationId: intent.organizationId, intentId: intent.id, expectedVersion: intent.stateVersion, simulationJson: blockedReport, simulationHash: hashCanonical(blockedReport), riskScore: 100, recommendation: "abort", blocked: true, abortReason: code }))!;
    }
    if (report) {
      const serialized = jsonSafeReport(report);
      const snapshot = policySnapshot(intent);
      const threshold = Math.min(snapshot.wallet.policy.blockRiskScoreAt, snapshot.assignment.policy.blockRiskScoreAt);
      const hardBlock = report.risks.some((risk) => ["SIM_FAILED", "DRAIN_DETECTED"].includes(risk.code));
      const blocked = hardBlock || report.recommendation === "abort" || report.riskScore >= threshold;
      intent = (await intents.completeSimulation({ organizationId: intent.organizationId, intentId: intent.id, expectedVersion: intent.stateVersion, simulationJson: serialized, simulationHash: hashCanonical(serialized), riskScore: report.riskScore, recommendation: report.recommendation, blocked, abortReason: blocked ? report.risks[0]?.code ?? "RISK_THRESHOLD" : undefined }))!;
    }
  }

  if (intent.state === "policy_blocked" || intent.state === "simulation_blocked") {
    const pending = await intents.transition(intent.id, intent.state, intent.stateVersion, "evidence_pending", { organizationId: intent.organizationId });
    if (pending) intent = pending;
  }
  if (intent.state === "evidence_pending") {
    const evidence = buildReasoningEvidence(evidenceDocument(intent, walletAddress));
    try {
      const published = await publishEvidence({ port: runtime.evidence, evidence, hosted: true });
      intent = (await intents.publishEvidence({ organizationId: intent.organizationId, intentId: intent.id, expectedVersion: intent.stateVersion, blobId: published.blobId, evidenceHash: evidence.hash })) ?? intent;
    } catch (error) {
      await intents.recordEvidenceFailure({ organizationId: intent.organizationId, intentId: intent.id, code: error instanceof PraxisSdkError ? error.code : "EVIDENCE_PUBLISH_FAILED" });
      return (await intents.byId(intent.organizationId, intent.id))!;
    }
  }

  if (intent.state !== "evidence_published") return intent;
  const reservation = await intents.reservationFor(intent.organizationId, intent.id);
  if (!reservation || reservation.state !== "active") {
    const pending = await intents.transition(intent.id, "evidence_published", intent.stateVersion, "abort_record_pending", { organizationId: intent.organizationId });
    if (!pending) return (await intents.byId(intent.organizationId, intent.id))!;
    intent = pending;
    let abortDigest: string | undefined;
    try {
      const result = await recordBlockedSuiIntent({ transport: runtime.transport, signer: runtime.signer, deployment: DEPLOYMENTS.testnet, agent: agentAddress(intent.agentId), recipient: intent.recipient, amount: BigInt(intent.amountMist), blobId: intent.evidenceBlobId!, reason: abortReason(intent.abortReason), riskScore: intent.riskScore ?? 100 });
      abortDigest = result.digest;
      if (runtime.transport.waitForTransaction) await runtime.transport.waitForTransaction({ digest: result.digest, include: { effects: true, events: true } });
      intent = (await intents.transition(intent.id, "abort_record_pending", intent.stateVersion, "blocked", { organizationId: intent.organizationId, outcome: "blocked", txDigest: result.digest })) ?? intent;
    } catch (error) {
      const pendingDigest = abortDigest ?? (error instanceof PraxisSdkError && error.code === "TRANSACTION_SUBMISSION_UNKNOWN" ? error.txDigest : undefined);
      if (pendingDigest) {
        return (await intents.recordChainReference(intent.organizationId, intent.id, pendingDigest)) ?? intent;
      }
      return intent;
    }
    return intent;
  }

  const workerId = crypto.randomUUID();
  let leaseResult: Awaited<ReturnType<typeof leases.acquire>>;
  try {
    leaseResult = await leases.acquire({ organizationId: intent.organizationId, walletId: intent.walletId, intentId: intent.id, workerId, ttlMs: 120_000 });
  } catch (error) {
    const preSignFailures = new Set(["LEASE_IDENTITY_INACTIVE", "LEASE_CREDENTIAL_INVALID", "LEASE_POLICY_MISMATCH", "LEASE_RESERVATION_MISMATCH", "LEASE_RESERVATION_EXPIRED"]);
    if (!(error instanceof DbDomainError) || !preSignFailures.has(error.code)) throw error;
    const failureCode = error.code === "LEASE_POLICY_MISMATCH" ? "POLICY_CHANGED_BEFORE_SIGN" : error.code === "LEASE_RESERVATION_EXPIRED" ? "RESERVATION_EXPIRED_BEFORE_SIGN" : "PRESIGN_REVALIDATION_FAILED";
    await reservations.releasePreSign({ organizationId: intent.organizationId, reservationId: reservation.id, proof: { kind: "definite_nonexecution", intentId: intent.id, purposeTag: intent.purposeTag, noSubmission: true, failureCode } });
    return (await intents.byId(intent.organizationId, intent.id))!;
  }
  const signing = await intents.transition(intent.id, "evidence_published", intent.stateVersion, "signing", { organizationId: intent.organizationId });
  if (!signing) {
    await leases.release({ organizationId: intent.organizationId, leaseId: leaseResult.lease.id, workerId });
    return (await intents.byId(intent.organizationId, intent.id))!;
  }
  intent = signing;
  let completedSubmission: { digest: string; receiptId?: string } | null = null;
  try {
    const execution = await executeApprovedSuiSpend({ transport: runtime.transport, signer: runtime.signer, deployment: DEPLOYMENTS.testnet, agent: agentAddress(intent.agentId), recipient: intent.recipient, amount: BigInt(intent.amountMist), coinType: intent.coinType, blobId: intent.evidenceBlobId!, sealPolicyId: "public", riskScore: intent.riskScore ?? 0, simulationPassed: true, purposeTag: intent.purposeTag });
    completedSubmission = execution;
    const submitted = await intents.transition(intent.id, "signing", intent.stateVersion, "submitted", { organizationId: intent.organizationId, txDigest: execution.digest, receiptId: execution.receiptId });
    if (!submitted) throw new Error("submission state race");
    intent = submitted;
    if (runtime.transport.waitForTransaction) await runtime.transport.waitForTransaction({ digest: execution.digest, include: { effects: true, events: true } });
    const proof = { kind: "confirmed" as const, outcome: "confirmed" as const, txDigest: execution.digest, receiptId: execution.receiptId, checkedAt: new Date(), evidence: { kind: "chain_scan" as const, intentId: intent.id, purposeTag: intent.purposeTag, finalizedCheckpoint: execution.digest, finalized: true as const } };
    await reservations.commit({ organizationId: intent.organizationId, reservationId: reservation.id, proof });
    await leases.release({ organizationId: intent.organizationId, leaseId: leaseResult.lease.id, workerId });
    return (await intents.byId(intent.organizationId, intent.id))!;
  } catch (error) {
    if (intent.state === "submitted") {
      await intents.transition(intent.id, "submitted", intent.stateVersion, "submission_unknown", { organizationId: intent.organizationId, txDigest: intent.txDigest ?? completedSubmission?.digest });
      return (await intents.byId(intent.organizationId, intent.id))!;
    }
    if (completedSubmission) {
      await intents.transition(intent.id, "signing", intent.stateVersion, "submission_unknown", { organizationId: intent.organizationId, txDigest: completedSubmission.digest, receiptId: completedSubmission.receiptId });
      return (await intents.byId(intent.organizationId, intent.id))!;
    }
    if (error instanceof PraxisSdkError && error.code === "TRANSACTION_SUBMISSION_UNKNOWN") {
      await intents.transition(intent.id, "signing", intent.stateVersion, "submission_unknown", { organizationId: intent.organizationId, txDigest: error.txDigest });
      return (await intents.byId(intent.organizationId, intent.id))!;
    }
    if (error instanceof PraxisSdkError && error.code === "TRANSACTION_FAILED" && error.txDigest) {
      const submitted = await intents.transition(intent.id, "signing", intent.stateVersion, "submitted", { organizationId: intent.organizationId, txDigest: error.txDigest });
      if (submitted) {
        const proof = { kind: "definite_failure" as const, outcome: "failed" as const, failureCode: error.code, txDigest: error.txDigest, checkedAt: new Date(), evidence: { kind: "chain_scan" as const, intentId: intent.id, purposeTag: intent.purposeTag, finalizedCheckpoint: error.txDigest, finalized: true as const } };
        await reservations.releaseReconciledUnknown({ organizationId: intent.organizationId, reservationId: reservation.id, proof });
        await leases.release({ organizationId: intent.organizationId, leaseId: leaseResult.lease.id, workerId });
      }
      return (await intents.byId(intent.organizationId, intent.id))!;
    }
    await reservations.releaseDefiniteNonExecution({ organizationId: intent.organizationId, reservationId: reservation.id, proof: { kind: "definite_nonexecution", intentId: intent.id, purposeTag: intent.purposeTag, noSubmission: true, failureCode: error instanceof PraxisSdkError ? error.code : "SIGNING_FAILED" } });
    await leases.release({ organizationId: intent.organizationId, leaseId: leaseResult.lease.id, workerId });
    return (await intents.byId(intent.organizationId, intent.id))!;
  }
}

export function defaultRuntime(): Runtime {
  if ((process.env.PRAXIS_NETWORK ?? "testnet") !== "testnet") throw new Error("Hosted control plane supports Testnet only");
  const key = process.env.PRAXIS_OPERATOR_KEY;
  if (!key) throw new Error("PRAXIS_OPERATOR_KEY is not configured");
  const transport = makeSuiClient("testnet");
  return { transport, signer: new KeypairAdapter(Ed25519Keypair.fromSecretKey(key), transport), evidence: new WalrusStore({ ...WALRUS_ENDPOINTS.testnet, mode: "hosted", timeoutMs: 60_000, maxBodyBytes: 64 * 1024 }) };
}

function initialWalletAddress(initial: Intent, current: Intent): string {
  const address = (initial as Intent & { walletAddress?: string }).walletAddress;
  if (address) return address;
  const snapshot = current.policySnapshotJson as Record<string, unknown> | null;
  const walletAddress = snapshot?.walletAddress;
  if (typeof walletAddress === "string") return walletAddress;
  throw new PraxisSdkError("CONFIGURATION_ERROR", "wallet address is unavailable for simulation");
}

function policySnapshot(intent: Intent): PolicySnapshot {
  const value = intent.policySnapshotJson as PolicySnapshot | null;
  if (!value?.wallet?.policy || !value.assignment?.policy) throw new Error("policy snapshot is unavailable");
  return value;
}

function toSdkPolicy(snapshot: PolicySnapshot) {
  const wallet = snapshot.wallet.policy;
  const assignment = snapshot.assignment.policy;
  return { maxPerTx: BigInt(wallet.maxPerTxMist) < BigInt(assignment.maxPerTxMist) ? BigInt(wallet.maxPerTxMist) : BigInt(assignment.maxPerTxMist), maxPerDay: BigInt(wallet.maxPerDayMist) < BigInt(assignment.maxPerDayMist) ? BigInt(wallet.maxPerDayMist) : BigInt(assignment.maxPerDayMist), minRiskScoreToBlock: Math.min(wallet.blockRiskScoreAt, assignment.blockRiskScoreAt), requireSim: true };
}

function jsonSafeReport(report: NormalizedSimulationReport): Record<string, unknown> {
  return { ...report, gasEstimate: report.gasEstimate.toString(), walletBalance: report.walletBalance.toString(), rawEffects: report.rawEffects ?? null };
}

function evidenceDocument(intent: Intent, walletAddress?: string) {
  const document = { schemaVersion: 3, intentId: intent.id, organizationRefHash: createHash("sha256").update(intent.organizationId).digest("hex"), agentRefHash: createHash("sha256").update(intent.agentId).digest("hex"), walletAddress: walletAddress ?? null, requestHash: intent.requestHash, purposeTag: intent.purposeTag, intent: { recipient: intent.recipient, amountMist: intent.amountMist, coinType: intent.coinType, privacy: intent.privacy }, reasoning: intent.reasoningJson, simulation: intent.simulationJson, walletPolicyVersionId: intent.walletPolicyVersionId, walletPolicyHash: intent.walletPolicyHash, assignmentPolicyVersionId: intent.assignmentPolicyVersionId, assignmentPolicyHash: intent.assignmentPolicyHash, effectivePolicyHash: intent.effectivePolicyHash, decision: intent.abortReason ? "blocked" : "allowed", timestamps: { receivedAt: intent.receivedAt.toISOString(), simulatedAt: intent.simulatedAt?.toISOString() ?? null }, versions: { schema: 3, controlPlane: "0.1.0", sdk: "0.1.0" } };
  return { ...document, evidenceHash: hashCanonical(document) };
}

function agentAddress(agentId: string): string { return `0x${createHash("sha256").update(agentId).digest("hex")}`; }
function abortReason(value: string | null): "agent_decision" | "policy_block" | "high_risk" | "sim_failed" { if (value?.includes("SIM")) return "sim_failed"; if (value?.includes("RISK") || value === "DRAIN_DETECTED") return "high_risk"; return "policy_block"; }
async function retrySimulation<T>(operation: () => Promise<T>): Promise<T> { let last: unknown; for (let attempt = 0; attempt < 2; attempt += 1) { try { return await operation(); } catch (error) { last = error; if (!(error instanceof PraxisSdkError) || !error.retryable || attempt === 1) throw error; await new Promise((resolve) => setTimeout(resolve, 50 + Math.floor(Math.random() * 50))); } } throw last; }

export function safeIntent(intent: Intent) { return { intentId: intent.id, state: intent.state, outcome: intent.outcome, recipient: intent.recipient, amountMist: intent.amountMist, walletPolicyVersionId: intent.walletPolicyVersionId, assignmentPolicyVersionId: intent.assignmentPolicyVersionId, effectivePolicyHash: intent.effectivePolicyHash, riskScore: intent.riskScore, recommendation: intent.recommendation, abortReason: intent.abortReason, txDigest: intent.txDigest, receiptId: intent.receiptId, walrusBlobId: intent.evidenceBlobId, createdAt: intent.createdAt, completedAt: intent.completedAt }; }

export async function reconcileIntents(runtime: Runtime = defaultRuntime()) {
  const intents = intentRepository();
  const reservations = reservationRepository();
  const leases = executionLeaseRepository();
  const rows = await intents.recoverable();
  const results: Array<{ intentId: string; state: string }> = [];
  for (const row of rows) {
    if (row.state === "evidence_pending") {
      const wallet = await workspaceRepository().walletById(row.organizationId, row.walletId);
      if (wallet) {
        const resumed = await processSpendIntent(row, runtime, wallet.suiAddress);
        results.push({ intentId: resumed.id, state: resumed.state });
      }
      continue;
    }
    if (row.state === "abort_record_pending") {
      if (row.txDigest) {
        const chain = await queryTransaction(runtime.transport, row.txDigest);
        if (chain === "confirmed") {
          const blocked = await intents.transition(row.id, "abort_record_pending", row.stateVersion, "blocked", { organizationId: row.organizationId, outcome: "blocked", txDigest: row.txDigest });
          results.push({ intentId: row.id, state: blocked?.state ?? row.state });
          continue;
        }
        if (chain === "unknown") { results.push({ intentId: row.id, state: row.state }); continue; }
      }
      const wallet = await workspaceRepository().walletById(row.organizationId, row.walletId);
      const resumed = wallet ? await resumeAbortRecord(row, runtime) : row;
      results.push({ intentId: row.id, state: resumed.state });
      continue;
    }
    if ((row.state === "submitted" || row.state === "submission_unknown") && row.txDigest) {
      const chain = await queryTransaction(runtime.transport, row.txDigest);
      const reservation = await intents.reservationFor(row.organizationId, row.id);
      const lease = await leases.active(row.organizationId, row.walletId);
      if (chain === "confirmed" && reservation) {
        await reservations.commit({ organizationId: row.organizationId, reservationId: reservation.id, proof: reconciliationProof(row, "confirmed") });
        if (lease) await leases.release({ organizationId: row.organizationId, leaseId: lease.id, workerId: lease.workerId });
      } else if (chain === "failed" && reservation) {
        await reservations.releaseReconciledUnknown({ organizationId: row.organizationId, reservationId: reservation.id, proof: reconciliationProof(row, "failed") });
        if (lease) await leases.release({ organizationId: row.organizationId, leaseId: lease.id, workerId: lease.workerId });
      }
      const current = (await intents.byId(row.organizationId, row.id))!;
      results.push({ intentId: row.id, state: current.state });
    }
  }
  return results;
}

async function resumeAbortRecord(intent: Intent, runtime: Runtime): Promise<Intent> {
  const intents = intentRepository();
  let abortDigest: string | undefined;
  try {
    const result = await recordBlockedSuiIntent({ transport: runtime.transport, signer: runtime.signer, deployment: DEPLOYMENTS.testnet, agent: agentAddress(intent.agentId), recipient: intent.recipient, amount: BigInt(intent.amountMist), blobId: intent.evidenceBlobId!, reason: abortReason(intent.abortReason), riskScore: intent.riskScore ?? 100 });
    abortDigest = result.digest;
    if (runtime.transport.waitForTransaction) await runtime.transport.waitForTransaction({ digest: result.digest, include: { effects: true, events: true } });
    return (await intents.transition(intent.id, "abort_record_pending", intent.stateVersion, "blocked", { organizationId: intent.organizationId, outcome: "blocked", txDigest: result.digest })) ?? intent;
  } catch (error) {
    const pendingDigest = abortDigest ?? (error instanceof PraxisSdkError ? error.txDigest : undefined);
    if (pendingDigest) return (await intents.recordChainReference(intent.organizationId, intent.id, pendingDigest)) ?? intent;
    return intent;
  }
}

async function queryTransaction(transport: SuiTransport, digest: string): Promise<"confirmed" | "failed" | "unknown"> {
  try {
    const raw = transport.waitForTransaction ? await transport.waitForTransaction({ digest, include: { effects: true, events: true, objectTypes: true }, timeout: 10_000 }) : transport.getTransaction ? await transport.getTransaction({ digest, include: { effects: true, events: true, objectTypes: true } }) : null;
    if (!raw || typeof raw !== "object") return "unknown";
    const outer = raw as Record<string, unknown>;
    const transaction = outer.Transaction && typeof outer.Transaction === "object" ? outer.Transaction as Record<string, unknown> : outer.$kind === "Transaction" ? outer.Transaction as Record<string, unknown> : outer;
    const status = transaction?.status as Record<string, unknown> | undefined;
    return status?.success === true ? "confirmed" : status?.success === false ? "failed" : "unknown";
  } catch { return "unknown"; }
}

function reconciliationProof(intent: Intent, outcome: "confirmed" | "failed") {
  const evidence = { kind: "chain_scan" as const, intentId: intent.id, purposeTag: intent.purposeTag, finalizedCheckpoint: intent.txDigest!, finalized: true as const };
  return outcome === "confirmed"
    ? { kind: "confirmed" as const, outcome: "confirmed" as const, txDigest: intent.txDigest!, receiptId: intent.receiptId ?? undefined, checkedAt: new Date(), evidence }
    : { kind: "definite_failure" as const, outcome: "failed" as const, failureCode: "CHAIN_EXECUTION_FAILED", txDigest: intent.txDigest!, checkedAt: new Date(), evidence };
}
