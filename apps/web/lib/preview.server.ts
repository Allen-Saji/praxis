import "server-only";
import { createVaultExecutionAdapter } from "./vault-runtime.server";
import { GrpcWebFetchTransport, SuiGrpcClient } from "@mysten/sui/grpc";
import { evaluatePolicies, normalizeSuiAddress, parseMist } from "@allen-saji/praxis-control-plane";
import type { PreviewIdentity, SpendingPreviewRepository } from "@allen-saji/praxis-db";
import { buildSuiTransferTransaction, resolveGrpcUrl, simulateSuiTransfer, type SuiTransport } from "@allen-saji/praxis";
import { HttpError, spendingPreviewRepository } from "./control-plane.server";
import { jsonSafeReport, simulationBlocks, toSdkPolicy } from "./spend-report";
import type { AgentContext, SpendRequest } from "./spend.server";

type Snapshot = Awaited<ReturnType<SpendingPreviewRepository["snapshot"]>>;
type PreviewDependencies = { snapshot(identity: PreviewIdentity): Promise<Snapshot>; transport: SuiTransport };

function previewDependencies(): PreviewDependencies {
  if ((process.env.PRAXIS_NETWORK ?? "testnet") !== "testnet") throw new HttpError(503, "NETWORK_UNAVAILABLE", "Hosted preview supports Sui Testnet");
  // One deadline covers all RPC calls in this preview; no background retry loop.
  const deadline = AbortSignal.timeout(10_000);
  const transport = new GrpcWebFetchTransport({ baseUrl: resolveGrpcUrl("testnet"), fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline }) });
  return { snapshot: (identity) => spendingPreviewRepository().snapshot(identity), transport: new SuiGrpcClient({ network: "testnet", transport }) };
}

export async function previewSpend(input: { context: AgentContext; request: SpendRequest }, dependencies?: PreviewDependencies) {
  if (input.context.wallet.adapterType === "delegated_vault" && process.env.PRAXIS_VAULT_EXECUTION_ENABLED !== "true") throw new HttpError(503, "VAULT_EXECUTION_PENDING", "Hosted vault preview is not enabled yet.");
  const deps = dependencies ?? previewDependencies();
  const { context } = input;
  const request = { ...input.request, recipient: normalizeSuiAddress(input.request.recipient), amountMist: parseMist(input.request.amountMist).toString() };
  const snapshot = await deps.snapshot({ organizationId: context.organization.id, walletId: context.wallet.id, agentId: context.agent.id, assignmentId: context.assignment.id, credentialId: context.credential.id });
  const policies = snapshot.policies;
  const evaluation = evaluatePolicies(policies.wallet.policy, policies.assignment.policy, request.recipient, request.amountMist, snapshot.usage);
  const budget = (scope: "wallet" | "assignment", period: "day" | "month") => {
    const current = snapshot.usage[scope][period];
    const policy = policies[scope].policy;
    const limit = period === "day" ? policy.maxPerDayMist : policy.maxPerMonthMist;
    const remaining = limit - BigInt(current.spentMist) - BigInt(current.reservedMist);
    return { ...current, limitMist: limit.toString(), remainingMist: (remaining > 0n ? remaining : 0n).toString() };
  };
  const base = {
    executionAuthorized: false as const,
    observedAt: snapshot.observedAt.toISOString(),
    network: "testnet" as const,
    payment: { recipient: request.recipient, amountMist: request.amountMist, coinType: request.coinType },
    walletPolicyVersionId: policies.wallet.id,
    assignmentPolicyVersionId: policies.assignment.id,
    effectivePolicyHash: policies.snapshot.effectivePolicyHash,
    budgets: { wallet: { day: budget("wallet", "day"), month: budget("wallet", "month") }, agent: { day: budget("assignment", "day"), month: budget("assignment", "month") } },
    policyViolations: evaluation.violations,
    notice: context.wallet.adapterType === "delegated_vault" ? "Preview only. Budget figures track Praxis requests; simulation checks current on-chain limits. No funds reserved or transferred." : "Preview only. No funds reserved or transferred. Execution checks current access, limits and simulation again.",
  };
  if (!evaluation.allowed) return { ...base, recommendation: "abort" as const, simulationStatus: "skipped" as const, simulationReport: null };
  try {
    const vault = context.wallet.adapterType === "delegated_vault" ? createVaultExecutionAdapter({ organizationId: context.organization.id, assignmentId: context.assignment.id, agentId: context.agent.id, vaultId: context.wallet.suiAddress, owner: context.wallet.vaultOwnerAddress ?? "", packageId: context.wallet.vaultPackageId ?? "" }) : null;
    const report = vault ? await vault.simulate({ id: "advisory-preview", recipient: request.recipient, amountMist: request.amountMist, evidenceBlobId: null }, toSdkPolicy(policies.snapshot)) : await simulateSuiTransfer({ transport: deps.transport, transaction: buildSuiTransferTransaction({ sender: snapshot.address, recipient: request.recipient, amount: BigInt(request.amountMist) }), sender: snapshot.address, recipient: request.recipient, amount: BigInt(request.amountMist), policy: toSdkPolicy(policies.snapshot) });
    return { ...base, recommendation: simulationBlocks(report, evaluation.effectiveRiskScore) ? "abort" as const : report.recommendation, simulationStatus: "completed" as const, simulationReport: jsonSafeReport(report) };
  } catch {
    // No transport errors or internal RPC details are exposed to the agent.
    return { ...base, recommendation: "abort" as const, simulationStatus: "unavailable" as const, simulationReport: null, error: { code: "SIMULATION_UNAVAILABLE", message: "Simulation could not be completed. Retry preview before requesting payment." } };
  }
}
