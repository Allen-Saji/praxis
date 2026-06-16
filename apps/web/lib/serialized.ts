/**
 * Plain, JSON-serializable shapes passed from server code to client components.
 * The server runs PraxisReader (which uses node:fs / node:crypto and reads raw
 * Sui events), converts every bigint to string, decodes blob-id byte arrays to
 * strings, and ships these flat objects. Client components import only these
 * types, never @praxis/sdk.
 */
import type {
  AbortReason,
  Recommendation,
  Risk,
  PolicyViolation,
  BalanceDelta,
} from "@praxis/sdk";

export type { Risk, PolicyViolation, BalanceDelta, Recommendation, AbortReason };

/** A spend receipt row, ready for the client. */
export interface SerializedReceipt {
  receiptId: string;
  agent: string;
  wallet: string;
  recipient: string;
  /** MIST as a decimal string. */
  amount: string;
  riskScore: number;
  simPassed: boolean;
  sealed: boolean;
  /** Decoded Walrus blob id (utf-8). */
  blobId: string;
  timestampMs: number;
  /** Derived: receipts carry no abort flag, so confirmed unless a matching abort exists. */
  status: "confirmed" | "aborted";
}

/** An AbortRecorded row, ready for the client. */
export interface SerializedAbort {
  agent: string;
  wallet: string;
  blobId: string;
  reasonCode: number;
  reasonLabel: string;
  riskScore: number;
  timestampMs: number;
}

export interface SerializedIndexStats {
  totalCount: number;
  totalAborts: number;
  abortRate: number;
}

/** Per-agent summary derived from the recent receipts and aborts. */
export interface SerializedAgent {
  address: string;
  spendCount: number;
  abortCount: number;
  abortRate: number;
  lastActivityMs: number;
  riskMix: Record<"low" | "medium" | "high" | "critical", number>;
}

/** Plaintext reasoning, ready for the client (no bigints). */
export interface SerializedReasoning {
  v: 2;
  type: "spend" | "abort";
  agent: string;
  wallet: string;
  ts: number;
  intent: {
    to: string;
    amount: string;
    coinType: string;
    reasoning: { prompt: string; decision: string; model: string };
  };
  simulation: {
    success: boolean;
    balanceChanges: BalanceDelta[];
    gasEstimate: string;
    riskScore: number;
    risks: Risk[];
    recommendation: Recommendation;
  };
  policyCheck: {
    passed: boolean;
    violations: PolicyViolation[];
  };
  outcome: "confirmed" | "aborted";
  abortReason: AbortReason | null;
  blake3: string;
}

/** Result of fetching a reasoning blob without decrypting. */
export type SerializedReasoningResult =
  | { sealed: false; reasoning: SerializedReasoning }
  | { sealed: true; policyId: string; auditors: string[] }
  | { sealed: false; reasoning: null; error: string };

/** Result of a decrypt attempt. */
export type DecryptResult =
  | { ok: true; reasoning: SerializedReasoning }
  | { ok: false; status: number; error: string; auditorCount?: number };
