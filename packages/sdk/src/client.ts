import { normalizeSuiAddressStrict } from "./address";
import { blake3Hex, canonicalize, stablePurposeTag } from "./canonical";
import { DEPLOYMENTS, SUI_TYPE, WALRUS_ENDPOINTS, type Deployment } from "./config";
import { PraxisSdkError } from "./errors";
import { executeApprovedSuiSpend, recordBlockedSuiIntent } from "./execution";
import { buildReasoningEvidence } from "./evidence";
import { makeSuiClient } from "./rpc";
import { buildSuiTransferTransaction, simulateSuiTransfer } from "./simulation";
import type { SuiTransport } from "./ports";
import { PraxisReader } from "./reader";
import { LocalSealer, type SealedBlob, type Sealer } from "./seal";
import { WalrusStore } from "./walrus";
import type {
  AbortReason,
  Network,
  ReasoningBlob,
  SimulateArgs,
  SimulationReport,
  SpendArgs,
  SpendingPolicy,
  SpendResult,
  WalletAdapter,
} from "./types";

export interface PraxisOptions {
  network?: Network;
  wallet: WalletAdapter;
  client?: SuiTransport;
  /** Override the gRPC endpoint (else SUI_GRPC_URL env, else the network default). */
  grpcUrl?: string;
  deployment?: Partial<Deployment>;
  policy?: SpendingPolicy;
  walrus?: { publisher?: string; aggregator?: string; epochs?: number; localFallbackDir?: string; mode?: "direct" | "hosted"; timeoutMs?: number; maxBodyBytes?: number; fetch?: typeof fetch };
  sealer?: Sealer;
  sealSecret?: string;
}

/**
 * The security middleware between an AI agent and its wallet.
 * Flow: parse intent -> simulate -> risk-score -> report back -> gate ->
 * publish evidence -> sign via the wallet adapter -> emit an on-chain record.
 */
export class Praxis {
  readonly network: Network;
  /** Transport-neutral client surface; gRPC is the default implementation. */
  readonly client: SuiTransport;
  readonly deployment: Deployment;
  /** Read-only data surface; the dashboard can use the same class directly. */
  readonly reader: PraxisReader;
  private readonly transport: SuiTransport;
  private wallet: WalletAdapter;
  private policy?: SpendingPolicy;
  private walrus: WalrusStore;
  private sealer: Sealer;
  /** In-process cumulative spend per agent, powers daily-limit detection. */
  private spentToday = new Map<string, bigint>();

  constructor(opts: PraxisOptions) {
    this.network = opts.network ?? "testnet";
    this.client = opts.client ?? makeSuiClient(this.network, opts.grpcUrl);
    this.transport = this.client;
    this.deployment = { ...DEPLOYMENTS[this.network], ...opts.deployment };
    this.wallet = opts.wallet;
    this.policy = opts.policy;
    const wep = WALRUS_ENDPOINTS[this.network];
    this.walrus = new WalrusStore({
      publisher: opts.walrus?.publisher ?? wep.publisher,
      aggregator: opts.walrus?.aggregator ?? wep.aggregator,
      epochs: opts.walrus?.epochs,
      localFallbackDir: opts.walrus?.localFallbackDir ?? ".praxis/blobs",
      mode: opts.walrus?.mode ?? "direct",
      timeoutMs: opts.walrus?.timeoutMs,
      maxBodyBytes: opts.walrus?.maxBodyBytes,
      fetch: opts.walrus?.fetch,
    });
    this.sealer = opts.sealer ?? new LocalSealer(opts.sealSecret);
    this.reader = new PraxisReader({
      network: this.network,
      client: this.client,
      deployment: this.deployment,
      walrusStore: this.walrus,
      sealer: this.sealer,
    });
  }

  /** Read-only audit surface: counters, receipt/abort events, and Seal reveal. */
  get audit(): PraxisReader {
    return this.reader;
  }

  /** Simulate a spend and return the risk report. No signing, no logging. */
  async simulate(args: SimulateArgs): Promise<SimulationReport> {
    const coinType = args.coinType ?? SUI_TYPE;
    assertSui(coinType);
    assertSpendAmount(args.amount);
    const sender = normalizeRecipient(await this.wallet.address());
    const agent = args.agent ? normalizeRecipient(args.agent) : sender;
    return this.runSimulation(sender, agent, normalizeRecipient(args.to), args.amount, coinType);
  }

  /** Full flow: intent -> simulate -> report -> gate -> evidence -> sign -> receipt. */
  async spend(args: SpendArgs): Promise<SpendResult> {
    const coinType = args.coinType ?? SUI_TYPE;
    assertSui(coinType);
    assertSpendAmount(args.amount);
    const wallet = normalizeRecipient(await this.wallet.address());
    const agent = args.agent ? normalizeRecipient(args.agent) : wallet;
    const spendArgs = { ...args, to: normalizeRecipient(args.to) };
    if (spendArgs.privacy === "sealed" && this.walrus.hosted) {
      throw new PraxisSdkError("SEALED_REASONING_NOT_AVAILABLE", "sealed reasoning is unavailable in hosted Phase 1");
    }

    const report = await this.runSimulation(wallet, agent, spendArgs.to, spendArgs.amount, coinType);

    const gate = await this.decide(report, spendArgs);
    const ts = Date.now();
    const requestHash =
      spendArgs.requestHash ??
      blake3Hex(
        canonicalize({
          agent,
          wallet,
          to: spendArgs.to,
          amount: spendArgs.amount.toString(),
          coinType,
          reasoning: spendArgs.reasoning,
        }),
      );
    const purposeTag = stablePurposeTag({
      organizationId: "direct-sdk",
      assignmentId: agent,
      idempotencyKey: spendArgs.idempotencyKey ?? requestHash,
      requestHash,
    });
    const blob = this.buildBlob({
      type: gate.proceed ? "spend" : "abort",
      agent,
      wallet,
      args: spendArgs,
      coinType,
      report,
      ts,
      purposeTag,
      abortReason: gate.abortReason ?? null,
    });

    // Reasoning is written to Walrus for BOTH outcomes -- the abort IS the audit trail.
    let sealPolicyId = "";
    let stored: unknown = blob;
    if (spendArgs.privacy === "sealed") {
      const auditors = spendArgs.auditors ?? [wallet];
      const sealed: SealedBlob = await this.sealer.seal(
        new TextEncoder().encode(canonicalize(blob)),
        auditors,
      );
      stored = sealed;
      sealPolicyId = sealed.policyId;
    }
    const evidence = buildReasoningEvidence(stored);
    const { blobId } = await this.walrus.write(evidence.bytes);

    if (!gate.proceed) {
      await this.recordAbort(
        agent,
        spendArgs.to,
        spendArgs.amount,
        blobId,
        gate.abortReason ?? "agent_decision",
        report.riskScore,
      );
      return {
        status: "aborted",
        walrusBlobId: blobId,
        simulationReport: report,
        abortReason: gate.abortReason,
      };
    }

    const { digest, receiptId } = await this.executeSpend({
      agent,
      to: spendArgs.to,
      amount: spendArgs.amount,
      coinType,
      blobId,
      sealPolicyId,
      riskScore: report.riskScore,
      simPassed: report.success,
      purposeTag,
    });

    this.spentToday.set(agent, (this.spentToday.get(agent) ?? 0n) + spendArgs.amount);
    return {
      status: "confirmed",
      receiptId,
      walrusBlobId: blobId,
      txDigest: digest,
      simulationReport: report,
    };
  }

  // === internals ===

  private async runSimulation(
    wallet: string,
    agent: string,
    to: string,
    amount: bigint,
    coinType: string,
  ): Promise<SimulationReport> {
    const transaction = buildSuiTransferTransaction({ sender: wallet, recipient: to, amount });
    return simulateSuiTransfer({
      transport: this.transport,
      transaction,
      sender: wallet,
      recipient: to,
      amount,
      coinType,
      daySpent: this.spentToday.get(agent) ?? 0n,
      policy: this.policy,
    });
  }

  private async decide(
    report: SimulationReport,
    args: SpendArgs,
  ): Promise<{ proceed: boolean; abortReason?: AbortReason }> {
    if (report.recommendation === "abort") {
      const reason: AbortReason = !report.success
        ? "sim_failed"
        : report.policyViolations.length > 0
          ? "policy_block"
          : "high_risk";
      return { proceed: false, abortReason: reason };
    }
    if (args.autoConfirm && report.recommendation === "proceed") {
      return { proceed: true };
    }
    if (args.onReport) {
      const ok = await args.onReport(report);
      return ok ? { proceed: true } : { proceed: false, abortReason: "agent_decision" };
    }
    return report.recommendation === "proceed"
      ? { proceed: true }
      : { proceed: false, abortReason: "agent_decision" };
  }

  private async executeSpend(p: {
    agent: string;
    to: string;
    amount: bigint;
    coinType: string;
    blobId: string;
    sealPolicyId: string;
    riskScore: number;
    simPassed: boolean;
    purposeTag: string;
  }): Promise<{ digest: string; receiptId?: string }> {
    return executeApprovedSuiSpend({
      transport: this.transport,
      signer: this.wallet,
      deployment: this.deployment,
      agent: p.agent,
      recipient: p.to,
      amount: p.amount,
      coinType: p.coinType,
      blobId: p.blobId,
      sealPolicyId: p.sealPolicyId,
      riskScore: p.riskScore,
      simulationPassed: p.simPassed,
      purposeTag: p.purposeTag,
    });
  }

  private async recordAbort(
    agent: string,
    recipient: string,
    amount: bigint,
    blobId: string,
    reason: AbortReason,
    riskScore: number,
  ): Promise<void> {
    await recordBlockedSuiIntent({
      transport: this.transport,
      signer: this.wallet,
      deployment: this.deployment,
      agent,
      recipient,
      amount,
      blobId,
      reason,
      riskScore,
    });
  }

  private buildBlob(p: {
    type: "spend" | "abort";
    agent: string;
    wallet: string;
    args: SpendArgs;
    coinType: string;
    report: SimulationReport;
    ts: number;
    purposeTag: string;
    abortReason: AbortReason | null;
  }): ReasoningBlob {
    const blob: Omit<ReasoningBlob, "blake3"> = {
      v: 2,
      type: p.type,
      agent: p.agent,
      wallet: p.wallet,
      ts: p.ts,
      purpose_tag: p.purposeTag,
      intent: {
        to: p.args.to,
        amount: p.args.amount.toString(),
        coin_type: p.coinType,
        reasoning: p.args.reasoning,
      },
      simulation: {
        success: p.report.success,
        balance_changes: p.report.balanceChanges,
        gas_estimate: p.report.gasEstimate.toString(),
        risk_score: p.report.riskScore,
        risks: p.report.risks,
        recommendation: p.report.recommendation,
      },
      policy_check: {
        passed: p.report.policyViolations.length === 0,
        violations: p.report.policyViolations,
      },
      outcome: p.type === "spend" ? "confirmed" : "aborted",
      abort_reason: p.abortReason,
    };
    return { ...blob, blake3: blake3Hex(canonicalize(blob)) };
  }

}

function assertSui(coinType: string): void {
  if (coinType !== SUI_TYPE) {
    throw new PraxisSdkError("UNSUPPORTED_COIN", `Phase 1 supports SUI only (got ${coinType})`);
  }
}

function assertSpendAmount(amount: bigint): void {
  if (typeof amount !== "bigint" || amount <= 0n || amount > 18_446_744_073_709_551_615n) {
    throw new PraxisSdkError("INVALID_AMOUNT", "amount must be a positive u64 value");
  }
}

function normalizeRecipient(address: string): string {
  try {
    return normalizeSuiAddressStrict(address);
  } catch (cause) {
    throw new PraxisSdkError("INVALID_ADDRESS", "address is not a valid Sui address", { cause });
  }
}
