import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { SuiGraphQLClient as GraphQLClient } from "@mysten/sui/graphql";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
  DEPLOYMENTS,
  WALRUS_ENDPOINTS,
  resolveGraphqlUrl,
  type Deployment,
} from "./config";
import { makeLegacyEventClient, makeSuiClient, resilientFetch } from "./rpc";
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
  client?: SuiGrpcClient;
  graphqlClient?: SuiGraphQLClient;
  legacyEventClient?: SuiJsonRpcClient;
  /** Override the gRPC endpoint (else SUI_GRPC_URL env, else the network default). */
  grpcUrl?: string;
  /** Override the GraphQL endpoint (else SUI_GRAPHQL_URL env, else the network default). */
  graphqlUrl?: string;
  /** Temporary provider override for pre-GraphQL historical events. */
  legacyEventRpcUrl?: string;
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
  readonly client: SuiGrpcClient;
  readonly deployment: Deployment;
  private graphql: SuiGraphQLClient;
  private legacyEvents: SuiJsonRpcClient;
  private walrus: WalrusStore;
  private sealer: Sealer;

  constructor(opts: PraxisReaderOptions = {}) {
    this.network = opts.network ?? "testnet";
    this.client = opts.client ?? makeSuiClient(this.network, opts.grpcUrl);
    this.graphql =
      opts.graphqlClient ??
      new GraphQLClient({
        network: this.network,
        url: resolveGraphqlUrl(this.network, opts.graphqlUrl),
        fetch: resilientFetch(),
      });
    this.legacyEvents =
      opts.legacyEventClient ?? makeLegacyEventClient(this.network, opts.legacyEventRpcUrl);
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
      objectId: this.deployment.agentIndexId,
      include: { json: true },
    });
    const fields = obj.object.json as Record<string, unknown> | null;
    const totalCount = Number(fields?.total_count ?? 0);
    const totalAborts = Number(fields?.total_aborts ?? 0);
    const denom = totalCount + totalAborts;
    return { totalCount, totalAborts, abortRate: denom === 0 ? 0 : totalAborts / denom };
  }

  /** Most recent confirmed-spend receipts, newest first. */
  async recent(limit = 50): Promise<ReceiptEvent[]> {
    return this.eventsOfType<ReceiptEvent>(
      `${this.deployment.packageId}::spending_receipt::SpendingReceiptCreated`,
      limit,
    );
  }

  async byAgent(agent: string, limit = 200): Promise<ReceiptEvent[]> {
    const target = safeNorm(agent);
    return (await this.recent(limit)).filter((r) => safeNorm(r.agent) === target);
  }

  /** Most recent blocked spends (the "drains prevented" feed), newest first. */
  async aborts(limit = 100): Promise<AbortEvent[]> {
    return this.eventsOfType<AbortEvent>(
      `${this.deployment.packageId}::agent_registry::AbortRecorded`,
      limit,
    );
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

  /** Fetch a receipt object for a deep link without relying on an event window. */
  async receipt(receiptId: string): Promise<ReceiptEvent | null> {
    try {
      const obj = await this.client.getObject({ objectId: receiptId, include: { json: true } });
      const fields = obj.object.json as Record<string, unknown> | null;
      if (!fields || !obj.object.type.includes("spending_receipt::SpendingReceipt")) return null;
      const sealPolicy = byteVector(fields.seal_policy_id);
      return {
        receipt_id: receiptId,
        agent: String(fields.agent ?? ""),
        wallet: String(fields.wallet ?? ""),
        recipient: String(fields.recipient ?? ""),
        amount: String(fields.amount ?? "0"),
        risk_score: Number(fields.risk_score ?? 0),
        sim_passed: Boolean(fields.sim_passed),
        sealed: sealPolicy.length > 0,
        walrus_blob_id: byteVector(fields.walrus_blob_id),
        timestamp_ms: String(fields.timestamp_ms ?? "0"),
      };
    } catch {
      return null;
    }
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

  private async eventsOfType<T>(type: string, limit: number): Promise<T[]> {
    const wanted = Math.max(1, Math.min(Math.floor(limit), 500));
    const values: Array<{ event: T; timestamp: string }> = [];
    let before: string | null = null;

    while (values.length < wanted) {
      const pageSize = Math.min(50, wanted - values.length);
      const result = (await this.graphql.query({
        query: EVENTS_QUERY,
        variables: { type, last: pageSize, before },
      })) as { data?: EventQueryResult; errors?: Array<{ message: string }> };
      if (result.errors?.length) {
        throw new Error(`event query failed: ${result.errors.map((error) => error.message).join("; ")}`);
      }
      const events = result.data?.events;
      if (!events) break;
      for (const node of events.nodes) {
        if (node.contents?.json && typeof node.contents.json === "object") {
          values.push({
            event: normalizeEvent(node.contents.json as Record<string, unknown>) as T,
            timestamp: node.timestamp ?? "",
          });
        }
      }
      if (!events.pageInfo.hasPreviousPage || !events.pageInfo.startCursor) break;
      before = events.pageInfo.startCursor;
    }

    const sorted = values
      .sort((a, b) => timestampMs(b.timestamp) - timestampMs(a.timestamp))
      .slice(0, wanted)
      .map((value) => value.event);
    if (sorted.length > 0) return sorted;

    const legacy = await this.legacyEvents.queryEvents({
      query: { MoveEventType: type },
      limit: wanted,
      order: "descending",
    });
    return legacy.data.map((event) => normalizeEvent(event.parsedJson as Record<string, unknown>) as T);
  }
}

const EVENTS_QUERY = `
  query PraxisEvents($type: String!, $last: Int!, $before: String) {
    events(last: $last, before: $before, filter: { type: $type }) {
      pageInfo { hasPreviousPage startCursor }
      nodes { timestamp contents { json } }
    }
  }
`;

interface EventQueryVariables {
  type: string;
  last: number;
  before: string | null;
}

interface EventQueryResult {
  events: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: Array<{ timestamp: string | null; contents: { json: unknown } | null }>;
  } | null;
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

function normalizeEvent(fields: Record<string, unknown>): Record<string, unknown> {
  const timestamp = fields.timestamp_ms;
  return {
    ...fields,
    walrus_blob_id: byteVector(fields.walrus_blob_id),
    timestamp_ms: timestamp == null ? "0" : String(timestamp),
  };
}

function byteVector(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((item) => Number(item));
  if (typeof value !== "string") return [];
  if (typeof Buffer !== "undefined") return Array.from(Buffer.from(value, "base64"));
  const decoded = atob(value);
  return Array.from(decoded, (char) => char.charCodeAt(0));
}

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
