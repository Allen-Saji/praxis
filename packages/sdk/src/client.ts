import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { hexToBytes } from "@noble/hashes/utils.js";
import { blake3Hex, canonicalize } from "./canonical";
import { DEPLOYMENTS, SUI_TYPE, WALRUS_ENDPOINTS, type Deployment } from "./config";
import { PraxisReader } from "./reader";
import { assessRisk } from "./risk";
import { LocalSealer, type SealedBlob, type Sealer } from "./seal";
import { WalrusStore } from "./walrus";
import type {
  AbortReason,
  BalanceDelta,
  Network,
  ReasoningBlob,
  SimulateArgs,
  SimulationReport,
  SpendArgs,
  SpendingPolicy,
  SpendResult,
  WalletAdapter,
} from "./types";

const ABORT_REASON_CODE: Record<AbortReason, number> = {
  agent_decision: 0,
  policy_block: 1,
  high_risk: 2,
  sim_failed: 3,
};

export interface PraxisOptions {
  network?: Network;
  wallet: WalletAdapter;
  client?: SuiJsonRpcClient;
  deployment?: Partial<Deployment>;
  policy?: SpendingPolicy;
  walrus?: { publisher?: string; aggregator?: string; epochs?: number; localFallbackDir?: string };
  sealer?: Sealer;
  sealSecret?: string;
}

/**
 * The security middleware between an AI agent and its wallet.
 * Flow: parse intent -> simulate -> risk-score -> report back -> gate ->
 * sign via the wallet adapter -> log reasoning to Walrus -> emit on-chain receipt.
 */
export class Praxis {
  readonly network: Network;
  readonly client: SuiJsonRpcClient;
  readonly deployment: Deployment;
  /** Read-only data surface; the dashboard can use the same class directly. */
  readonly reader: PraxisReader;
  private wallet: WalletAdapter;
  private policy?: SpendingPolicy;
  private walrus: WalrusStore;
  private sealer: Sealer;
  /** In-process cumulative spend per agent, powers daily-limit detection. */
  private spentToday = new Map<string, bigint>();

  constructor(opts: PraxisOptions) {
    this.network = opts.network ?? "testnet";
    this.client =
      opts.client ??
      new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(this.network), network: this.network });
    this.deployment = { ...DEPLOYMENTS[this.network], ...opts.deployment };
    this.wallet = opts.wallet;
    this.policy = opts.policy;
    const wep = WALRUS_ENDPOINTS[this.network];
    this.walrus = new WalrusStore({
      publisher: opts.walrus?.publisher ?? wep.publisher,
      aggregator: opts.walrus?.aggregator ?? wep.aggregator,
      epochs: opts.walrus?.epochs,
      localFallbackDir: opts.walrus?.localFallbackDir ?? ".praxis/blobs",
    });
    this.sealer = opts.sealer ?? new LocalSealer(opts.sealSecret ?? "praxis-dev-seal-secret");
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
    const sender = await this.wallet.address();
    const agent = args.agent ? normalizeSuiAddress(args.agent) : sender;
    return this.runSimulation(sender, agent, args.to, args.amount, coinType);
  }

  /** Full flow: intent -> simulate -> report -> gate -> sign -> log -> receipt. */
  async spend(args: SpendArgs): Promise<SpendResult> {
    const coinType = args.coinType ?? SUI_TYPE;
    assertSui(coinType);
    const wallet = await this.wallet.address();
    const agent = args.agent ? normalizeSuiAddress(args.agent) : wallet;

    const report = await this.runSimulation(wallet, agent, args.to, args.amount, coinType);

    const gate = await this.decide(report, args);
    const ts = Date.now();
    const blob = this.buildBlob({
      type: gate.proceed ? "spend" : "abort",
      agent,
      wallet,
      args,
      coinType,
      report,
      ts,
      abortReason: gate.abortReason ?? null,
    });

    // Reasoning is written to Walrus for BOTH outcomes -- the abort IS the audit trail.
    let sealPolicyId = "";
    let stored: unknown = blob;
    if (args.privacy === "sealed") {
      const auditors = args.auditors ?? [wallet];
      const sealed: SealedBlob = await this.sealer.seal(
        new TextEncoder().encode(canonicalize(blob)),
        auditors,
      );
      stored = sealed;
      sealPolicyId = sealed.policyId;
    }
    const { blobId } = await this.walrus.writeJson(stored);

    if (!gate.proceed) {
      await this.recordAbort(agent, blobId, gate.abortReason ?? "agent_decision", report.riskScore);
      return {
        status: "aborted",
        walrusBlobId: blobId,
        simulationReport: report,
        abortReason: gate.abortReason,
      };
    }

    const purposeTag = blake3Hex(
      canonicalize({ agent, to: args.to, amount: args.amount.toString(), coinType, ts }),
    );
    const { digest, receiptId } = await this.executeSpend({
      agent,
      to: args.to,
      amount: args.amount,
      coinType,
      blobId,
      sealPolicyId,
      riskScore: report.riskScore,
      simPassed: report.success,
      purposeTag,
    });

    this.spentToday.set(agent, (this.spentToday.get(agent) ?? 0n) + args.amount);
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
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
    tx.transferObjects([coin], tx.pure.address(to));
    tx.setSender(wallet);
    const bytes = await tx.build({ client: this.client });
    const dry = await this.client.dryRunTransactionBlock({ transactionBlock: bytes });

    const status = dry.effects?.status?.status;
    const success = status === "success";
    const balanceChanges: BalanceDelta[] = (dry.balanceChanges ?? []).map((bc) => ({
      owner: ownerAddress(bc.owner),
      coinType: bc.coinType,
      amount: bc.amount,
    }));
    const gasEstimate = computeGas(dry.effects?.gasUsed);
    const walletBalance = await this.getBalance(wallet, coinType);

    const risk = assessRisk({
      simSuccess: success,
      balanceChanges,
      gasEstimate,
      sender: wallet,
      recipient: to,
      amount,
      coinType,
      walletBalance,
      daySpent: this.spentToday.get(agent) ?? 0n,
      policy: this.policy,
    });

    return {
      success,
      balanceChanges,
      gasEstimate,
      riskScore: risk.riskScore,
      risks: risk.risks,
      policyViolations: risk.policyViolations,
      recommendation: risk.recommendation,
      rawEffects: dry.effects,
    };
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
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(p.amount)]);
    tx.moveCall({
      target: `${this.deployment.packageId}::spending_receipt::record_spend`,
      typeArguments: [p.coinType],
      arguments: [
        tx.object(this.deployment.agentIndexId),
        coin,
        tx.pure.address(p.agent),
        tx.pure.address(p.to),
        tx.pure.vector("u8", utf8Bytes(p.blobId)),
        tx.pure.vector("u8", utf8Bytes(p.sealPolicyId)),
        tx.pure.u8(p.riskScore),
        tx.pure.bool(p.simPassed),
        tx.pure.vector("u8", Array.from(hexToBytes(p.purposeTag))),
        tx.object(this.deployment.clockId),
      ],
    });

    const signed = await this.wallet.signTransaction(tx);
    const res = await this.client.executeTransactionBlock({
      transactionBlock: signed.bytes,
      signature: signed.signature,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });
    if (res.effects?.status?.status !== "success") {
      throw new Error(`spend tx failed: ${res.effects?.status?.error ?? "unknown"}`);
    }
    const created = res.objectChanges?.find(
      (o) => o.type === "created" && o.objectType.includes("spending_receipt::SpendingReceipt"),
    );
    const receiptId = created && created.type === "created" ? created.objectId : undefined;
    return { digest: res.digest, receiptId };
  }

  private async recordAbort(
    agent: string,
    blobId: string,
    reason: AbortReason,
    riskScore: number,
  ): Promise<void> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.deployment.packageId}::agent_registry::record_abort`,
      arguments: [
        tx.object(this.deployment.agentIndexId),
        tx.pure.address(agent),
        tx.pure.vector("u8", utf8Bytes(blobId)),
        tx.pure.u8(ABORT_REASON_CODE[reason]),
        tx.pure.u8(riskScore),
        tx.object(this.deployment.clockId),
      ],
    });
    const signed = await this.wallet.signTransaction(tx);
    await this.client.executeTransactionBlock({
      transactionBlock: signed.bytes,
      signature: signed.signature,
      options: { showEffects: true },
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
    abortReason: AbortReason | null;
  }): ReasoningBlob {
    const blob: Omit<ReasoningBlob, "blake3"> = {
      v: 2,
      type: p.type,
      agent: p.agent,
      wallet: p.wallet,
      ts: p.ts,
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

  private async getBalance(owner: string, coinType: string): Promise<bigint> {
    try {
      const b = await this.client.getBalance({ owner, coinType });
      return BigInt(b.totalBalance);
    } catch {
      return 0n;
    }
  }
}

function assertSui(coinType: string): void {
  if (coinType !== SUI_TYPE) {
    throw new Error(`V1 supports SUI spends only (got ${coinType}); multi-coin is post-hackathon.`);
  }
}

function utf8Bytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function ownerAddress(owner: unknown): string {
  if (owner && typeof owner === "object" && "AddressOwner" in owner) {
    return (owner as { AddressOwner: string }).AddressOwner;
  }
  if (owner && typeof owner === "object" && "ObjectOwner" in owner) {
    return (owner as { ObjectOwner: string }).ObjectOwner;
  }
  return "";
}

function computeGas(gasUsed?: {
  computationCost: string;
  storageCost: string;
  storageRebate: string;
}): bigint {
  if (!gasUsed) return 0n;
  const total =
    BigInt(gasUsed.computationCost) + BigInt(gasUsed.storageCost) - BigInt(gasUsed.storageRebate);
  return total < 0n ? 0n : total;
}
