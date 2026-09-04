import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { SuiGraphQLClient as GraphQLClient } from "@mysten/sui/graphql";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
  DEPLOYMENTS,
  WALRUS_ENDPOINTS,
  resolveGraphqlUrl,
  type Deployment,
} from "./config";
import { makeLegacyDashboardEventBridge, makeSuiClient, resilientFetch } from "./rpc";
import type { LegacyDashboardEventBridge } from "./legacy-dashboard";
import type { SuiTransport } from "./ports";
import { PraxisSdkError } from "./errors";
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
  client?: SuiTransport;
  graphqlClient?: SuiGraphQLClient;
  /** @deprecated use legacyEventBridge; retained for dashboard compatibility. */
  legacyEventClient?: LegacyDashboardEventBridge;
  legacyEventBridge?: LegacyDashboardEventBridge;
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
  /** Transport-neutral client surface; gRPC is the default implementation. */
  readonly client: SuiTransport;
  readonly deployment: Deployment;
  private graphql: SuiGraphQLClient;
  private transport: SuiTransport;
  private legacyEvents: LegacyDashboardEventBridge;
  private walrus: WalrusStore;
  private sealer: Sealer;

  constructor(opts: PraxisReaderOptions = {}) {
    this.network = opts.network ?? "testnet";
    this.client = opts.client ?? makeSuiClient(this.network, opts.grpcUrl);
    this.transport = this.client;
    this.graphql =
      opts.graphqlClient ??
      new GraphQLClient({
        network: this.network,
        url: resolveGraphqlUrl(this.network, opts.graphqlUrl),
        fetch: resilientFetch(),
      });
    if (this.network !== "testnet" && (opts.legacyEventBridge || opts.legacyEventClient)) {
      throw new PraxisSdkError("CONFIGURATION_ERROR", "the legacy event bridge is Testnet dashboard-only");
    }
    this.legacyEvents =
      opts.legacyEventBridge ??
      opts.legacyEventClient ??
      (this.network === "testnet" ? makeLegacyDashboardEventBridge(this.network, opts.legacyEventRpcUrl) : disabledLegacyBridge());
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
    const obj = await this.transport.getObject({
      objectId: this.deployment.agentIndexId,
      include: { json: true },
    });
    const decoded = decodeObject(obj, "agent index");
    const fields = decoded.json;
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
      const obj = await this.transport.getObject({ objectId: receiptId, include: { json: true } });
      const decoded = decodeObject(obj, "receipt");
      const fields = decoded.json;
      if (!fields || !decoded.type.includes("spending_receipt::SpendingReceipt")) return null;
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
      const result = decodeGraphqlResult(await this.graphql.query({
        query: EVENTS_QUERY,
        variables: { type, last: pageSize, before },
      }));
      if (result.errors?.length) {
        throw new PraxisSdkError("EVENT_READ_FAILED", "event history is unavailable", {
          cause: result.errors,
          retryable: true,
        });
      }
      const events = result.data?.events;
      if (!events) break;
      for (const node of events.nodes) {
        if (!node.contents || !isRecord(node.contents.json)) {
          throw new PraxisSdkError("EVENT_RESPONSE_MALFORMED", "event node contents are malformed");
        }
        values.push({
          event: normalizeEvent(node.contents.json) as T,
          timestamp: node.timestamp ?? "",
        });
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
    if (!legacy || !Array.isArray(legacy.data)) {
      throw new PraxisSdkError("EVENT_RESPONSE_MALFORMED", "legacy event response is malformed");
    }
    return legacy.data.map((event) => {
      if (!isRecord(event) || !isRecord(event.parsedJson)) {
        throw new PraxisSdkError("EVENT_RESPONSE_MALFORMED", "legacy event contents are malformed");
      }
      return normalizeEvent(event.parsedJson) as T;
    });
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

function decodeObject(value: unknown, operation: string): { type: string; json: Record<string, unknown> | null } {
  if (!isRecord(value) || !isRecord(value.object) || typeof value.object.type !== "string") {
    throw new PraxisSdkError("TRANSACTION_RESPONSE_MALFORMED", `${operation} response is malformed`);
  }
  const json = value.object.json;
  if (json !== null && json !== undefined && !isRecord(json)) {
    throw new PraxisSdkError("TRANSACTION_RESPONSE_MALFORMED", `${operation} JSON is malformed`);
  }
  return { type: value.object.type, json: (json as Record<string, unknown> | null | undefined) ?? null };
}

function disabledLegacyBridge(): LegacyDashboardEventBridge {
  return {
    queryEvents: async () => {
      throw new PraxisSdkError("CONFIGURATION_ERROR", "legacy event history is disabled outside Testnet");
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeGraphqlResult(value: unknown): { data?: EventQueryResult; errors?: Array<{ message: string }> } {
  if (!isRecord(value)) throw new PraxisSdkError("EVENT_RESPONSE_MALFORMED", "event response is malformed");
  const rawErrors = value.errors;
  if (rawErrors !== undefined && (!Array.isArray(rawErrors) || rawErrors.some((item) => !isRecord(item) || typeof item.message !== "string"))) {
    throw new PraxisSdkError("EVENT_RESPONSE_MALFORMED", "event response errors are malformed");
  }
  const errors = rawErrors as Array<{ message: string }> | undefined;
  const rawData = value.data;
  if (rawData === undefined || rawData === null) return { errors };
  if (!isRecord(rawData)) throw new PraxisSdkError("EVENT_RESPONSE_MALFORMED", "event response data is malformed");
  const rawEvents = rawData.events;
  if (rawEvents === null) return { errors, data: { events: null } };
  if (!isRecord(rawEvents) || !isRecord(rawEvents.pageInfo) ||
      typeof rawEvents.pageInfo.hasPreviousPage !== "boolean" ||
      (rawEvents.pageInfo.startCursor !== null && typeof rawEvents.pageInfo.startCursor !== "string") ||
      !Array.isArray(rawEvents.nodes)) {
    throw new PraxisSdkError("EVENT_RESPONSE_MALFORMED", "event pagination data is malformed");
  }
  const nodes = rawEvents.nodes.map((node) => {
    if (!isRecord(node) || !("timestamp" in node) ||
        (node.timestamp !== null && typeof node.timestamp !== "string") ||
        !isRecord(node.contents)) {
      throw new PraxisSdkError("EVENT_RESPONSE_MALFORMED", "event node is malformed");
    }
    return { timestamp: node.timestamp as string | null, contents: { json: node.contents.json } };
  });
  return {
    errors,
    data: {
      events: {
        pageInfo: {
          hasPreviousPage: rawEvents.pageInfo.hasPreviousPage,
          startCursor: rawEvents.pageInfo.startCursor as string | null,
        },
        nodes,
      },
    },
  };
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
  if (Array.isArray(value)) {
    if (value.some((item) => !Number.isInteger(item) || (item as number) < 0 || (item as number) > 255)) {
      throw new PraxisSdkError("EVENT_RESPONSE_MALFORMED", "event byte vector is malformed");
    }
    return value as number[];
  }
  if (typeof value !== "string") return [];
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new PraxisSdkError("EVENT_RESPONSE_MALFORMED", "event byte vector is malformed");
  }
  if (typeof Buffer !== "undefined") return Array.from(Buffer.from(value, "base64"));
  const decoded = atob(value);
  return Array.from(decoded, (char) => char.charCodeAt(0));
}

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
