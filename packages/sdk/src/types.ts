import type { Transaction } from "@mysten/sui/transactions";

export type Network = "testnet" | "mainnet";

export type Privacy = "public" | "sealed";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Recommendation = "proceed" | "review" | "abort";
export type SpendStatus = "confirmed" | "aborted";
export type AbortReason = "agent_decision" | "policy_block" | "high_risk" | "sim_failed";

export interface ReasoningInput {
  prompt: string;
  decision: string;
  model: string;
  metadata?: Record<string, unknown>;
}

export interface Risk {
  level: RiskLevel;
  code: string;
  message: string;
}

export interface PolicyViolation {
  code: string;
  message: string;
}

/** A single signed balance delta from a dry-run, normalized to a flat shape. */
export interface BalanceDelta {
  owner: string;
  coinType: string;
  amount: string;
}

/** The rich report that flows back to the agent before signing. */
export interface SimulationReport {
  success: boolean;
  balanceChanges: BalanceDelta[];
  gasEstimate: bigint;
  riskScore: number;
  risks: Risk[];
  policyViolations: PolicyViolation[];
  recommendation: Recommendation;
  rawEffects: unknown;
}

export interface SpendResult {
  status: SpendStatus;
  receiptId?: string;
  walrusBlobId: string;
  txDigest?: string;
  simulationReport: SimulationReport;
  abortReason?: AbortReason;
}

export interface SimulateArgs {
  to: string;
  amount: bigint;
  coinType?: string;
  /** Logical agent identity for daily-limit accounting; defaults to the wallet. */
  agent?: string;
}

export interface SpendArgs {
  to: string;
  amount: bigint;
  coinType?: string;
  reasoning: ReasoningInput;
  /** Logical agent identity recorded on the receipt; defaults to the wallet. */
  agent?: string;
  privacy?: Privacy;
  auditors?: string[];
  /** Skip the agent review gate for low-risk, policy-approved spends. */
  autoConfirm?: boolean;
  /**
   * The decision gate. Receives the simulation report; returns true to proceed.
   * If omitted, Praxis proceeds only when the recommendation is "proceed".
   */
  onReport?: (report: SimulationReport) => boolean | Promise<boolean>;
}

/** Local mirror of the on-chain SpendingPolicy. */
export interface SpendingPolicy {
  maxPerTx?: bigint;
  maxPerDay?: bigint;
  allowedRecipients?: string[];
  blockedRecipients?: string[];
  /** Block when riskScore >= this value. 0/undefined => default threshold (80). */
  minRiskScoreToBlock?: number;
  requireSim?: boolean;
}

export interface SignedTransaction {
  /** base64-encoded transaction bytes */
  bytes: string;
  signature: string;
}

/** Any wallet provider implements this. Praxis never sees a private key. */
export interface WalletAdapter {
  address(): Promise<string>;
  signTransaction(tx: Transaction): Promise<SignedTransaction>;
}

/** Canonical Walrus reasoning blob (schema v2, mirrors SPEC section 9.1). */
export interface ReasoningBlob {
  v: 2;
  type: "spend" | "abort";
  agent: string;
  wallet: string;
  ts: number;
  intent: {
    to: string;
    amount: string;
    coin_type: string;
    reasoning: ReasoningInput;
  };
  simulation: {
    success: boolean;
    balance_changes: BalanceDelta[];
    gas_estimate: string;
    risk_score: number;
    risks: Risk[];
    recommendation: Recommendation;
  };
  policy_check: {
    passed: boolean;
    violations: PolicyViolation[];
  };
  outcome: "confirmed" | "aborted";
  abort_reason: AbortReason | null;
  blake3: string;
}
