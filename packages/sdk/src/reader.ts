import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { DEPLOYMENTS, WALRUS_ENDPOINTS, type Deployment } from "./config";
import { LocalSealer, type SealedBlob, type Sealer } from "./seal";
import { WalrusStore } from "./walrus";
import type { Network, ReasoningBlob } from "./types";

/** Parsed SpendingReceiptCreated event. */
export interface ReceiptEvent {
  receipt_id: string;
  agent: string;
  wallet: string;
  recipient: string;
  amount: string;
  risk_score: number;
  sim_passed: boolean;
  sealed: boolean;
  walrus_blob_id: number[];
  timestamp_ms: string;
}

/** Parsed AbortRecorded event. */
export interface AbortEvent {
  agent: string;
  wallet: string;
  recipient: string;
  amount: string;
  walrus_blob_id: number[];
  /** 0 agent_decision, 1 policy_block, 2 high_risk, 3 sim_failed. */
  reason_code: number;
  risk_score: number;
  timestamp_ms: string;
}

export const ABORT_REASON_LABELS = [
  "agent_decision",
  "policy_block",
  "high_risk",
  "sim_failed",
] as const;

/** One row of the unified spend stream: a confirmed spend or a blocked one. */
export interface StreamEntry {
  kind: "spend" | "abort";
  status: "confirmed" | "aborted";
  agent: string;
  wallet: string;
  recipient: string;
  amount: string;
  risk_score: number;
  sealed: boolean;
  walrus_blob_id: number[];
  timestamp_ms: string;
  /** Present on confirmed spends. */
  receipt_id?: string;
  /** Present on aborts. */
  abort_reason?: string;
}

export interface IndexStats {
  totalCount: number;
  totalAborts: number;
  abortRate: number;
}

/** A reasoning blob is either readable or sealed (and only then decryptable). */
export type ReasoningResult =
  | { sealed: false; blob: ReasoningBlob }
  | { sealed: true; policyId: string; auditors: string[] };

export interface PraxisReaderOptions {
  network?: Network;
  client?: SuiJsonRpcClient;
  deployment?: Partial<Deployment>;
  walrusStore?: WalrusStore;
  walrus?: { publisher?: string; aggregator?: string; localFallbackDir?: string };
  sealer?: Sealer;
  sealSecret?: string;
}

/**
 * Read-only view over Praxis data: on-chain counters, receipt and abort events,
 * and Walrus reasoning blobs (with Seal-gated reveal). Needs no wallet, so the
 * dashboard and any auditor tooling can use it directly. `Praxis` delegates its
 * `audit` surface to an instance of this class.
 */
export class PraxisReader {
  readonly network: Network;
  readonly client: SuiJsonRpcClient;
  readonly deployment: Deployment;
  private walrus: WalrusStore;
  private sealer: Sealer;

  constructor(opts: PraxisReaderOptions = {}) {
    this.network = opts.network ?? "testnet";
    this.client =
      opts.client ??
      new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(this.network), network: this.network });
    this.deployment = { ...DEPLOYMENTS[this.network], ...opts.deployment };
    const wep = WALRUS_ENDPOINTS[this.network];
    this.walrus =
      opts.walrusStore ??
      new WalrusStore({
        publisher: opts.walrus?.publisher ?? wep.publisher,
        aggregator: opts.walrus?.aggregator ?? wep.aggregator,
        localFallbackDir: opts.walrus?.localFallbackDir ?? ".praxis/blobs",
      });
    this.sealer = opts.sealer ?? new LocalSealer(opts.sealSecret);
  }

  /** On-chain totals from the shared AgentIndex object. */
  async indexStats(): Promise<IndexStats> {
    const obj = await this.client.getObject({
      id: this.deployment.agentIndexId,
      options: { showContent: true },
    });
    const fields = (obj.data?.content as { fields?: Record<string, string> })?.fields;
    const totalCount = Number(fields?.total_count ?? 0);
    const totalAborts = Number(fields?.total_aborts ?? 0);
    const denom = totalCount + totalAborts;
    return { totalCount, totalAborts, abortRate: denom === 0 ? 0 : totalAborts / denom };
  }

  /** Most recent confirmed-spend receipts, newest first. */
  async recent(limit = 50): Promise<ReceiptEvent[]> {
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${this.deployment.packageId}::spending_receipt::SpendingReceiptCreated`,
      },
      limit,
      order: "descending",
    });
    return events.data.map((e) => e.parsedJson as ReceiptEvent);
  }

  async byAgent(agent: string, limit = 200): Promise<ReceiptEvent[]> {
    const target = safeNorm(agent);
    return (await this.recent(limit)).filter((r) => safeNorm(r.agent) === target);
  }

  /** Most recent blocked spends (the "drains prevented" feed), newest first. */
  async aborts(limit = 100): Promise<AbortEvent[]> {
    const events = await this.client.queryEvents({
      query: { MoveEventType: `${this.deployment.packageId}::agent_registry::AbortRecorded` },
      limit,
      order: "descending",
    });
    return events.data.map((e) => e.parsedJson as AbortEvent);
  }

  async abortsByAgent(agent: string, limit = 200): Promise<AbortEvent[]> {
    const target = safeNorm(agent);
    return (await this.aborts(limit)).filter((a) => safeNorm(a.agent) === target);
  }

  /** Unified feed of confirmed and aborted spends, newest first. */
  async stream(limit = 50): Promise<StreamEntry[]> {
    const [spends, aborts] = await Promise.all([this.recent(limit), this.aborts(limit)]);
    const entries: StreamEntry[] = [
      ...spends.map(
        (r): StreamEntry => ({
          kind: "spend",
          status: "confirmed",
          agent: r.agent,
          wallet: r.wallet,
          recipient: r.recipient,
          amount: r.amount,
          risk_score: r.risk_score,
          sealed: r.sealed,
          walrus_blob_id: r.walrus_blob_id,
          timestamp_ms: r.timestamp_ms,
          receipt_id: r.receipt_id,
        }),
      ),
      ...aborts.map(
        (a): StreamEntry => ({
          kind: "abort",
          status: "aborted",
          agent: a.agent,
          wallet: a.wallet,
          recipient: a.recipient,
          amount: a.amount,
          risk_score: a.risk_score,
          sealed: false,
          walrus_blob_id: a.walrus_blob_id,
          timestamp_ms: a.timestamp_ms,
          abort_reason: ABORT_REASON_LABELS[a.reason_code] ?? "unknown",
        }),
      ),
    ];
    entries.sort((x, y) => Number(y.timestamp_ms) - Number(x.timestamp_ms));
    return entries.slice(0, limit);
  }

  /** Fetch a reasoning blob. Sealed blobs return a marker, not plaintext. */
  async reasoning(blobId: string): Promise<ReasoningResult> {
    const raw = await this.walrus.readJson<SealedBlob | ReasoningBlob>(blobId);
    if (isSealed(raw)) return { sealed: true, policyId: raw.policyId, auditors: raw.auditors };
    return { sealed: false, blob: raw };
  }

  /** Decrypt a sealed blob if the viewer is allowlisted. Server-side only. */
  async reveal(blobId: string, viewer: string): Promise<ReasoningBlob> {
    const raw = await this.walrus.readJson<SealedBlob | ReasoningBlob>(blobId);
    if (!isSealed(raw)) return raw;
    const plaintext = await this.sealer.reveal(raw, viewer);
    return JSON.parse(new TextDecoder().decode(plaintext)) as ReasoningBlob;
  }
}

function isSealed(v: SealedBlob | ReasoningBlob): v is SealedBlob {
  return (v as SealedBlob).sealed === true;
}

function safeNorm(a: string): string {
  try {
    return normalizeSuiAddress(a);
  } catch {
    return a;
  }
}
