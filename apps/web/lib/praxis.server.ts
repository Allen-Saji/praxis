import "server-only";

import {
  PraxisReader,
  type ReceiptEvent,
  type AbortEvent,
  type StreamEntry,
  type ReasoningBlob,
} from "@allen-saji/praxis";
import { bytesToString } from "./format";
import { reasonCodeLabel, scoreToBand } from "./risk";
import { cached } from "./server-cache";
import { verifyDecryptAuth } from "./verify.server";
import type {
  SerializedReceipt,
  SerializedAbort,
  SerializedStreamEntry,
  SerializedIndexStats,
  SerializedAgent,
  SerializedReasoning,
  SerializedReasoningResult,
  DecryptResult,
} from "./serialized";

/**
 * Server-only Praxis data layer. The ONLY module that imports @allen-saji/praxis.
 * Everything here runs in Server Components, route handlers, or server actions.
 * It reads live testnet data and returns flat, JSON-safe objects (every bigint
 * already a string, every blob-id byte array already decoded). The seal master
 * secret is read from PRAXIS_SEAL_SECRET and stays in this process; it must
 * match the secret the agents sealed with, and reveal throws if it is unset.
 */

/**
 * How long cached testnet reads stay warm. The dataset is static (no seeder in
 * prod), so this only bounds how "live" the dashboard feels while shielding the
 * public RPC endpoint from the 5s SWR poll multiplied across every viewer.
 */
const READ_TTL_MS = 30_000;

let reader: PraxisReader | null = null;

function getReader(): PraxisReader {
  if (!reader) {
    reader = new PraxisReader({
      network: "testnet",
      // Overrides the (now-retired) fullnode.testnet.sui.io default. Falls back
      // to the SDK's working default when SUI_RPC_URL is unset.
      rpcUrl: process.env.SUI_RPC_URL,
      sealSecret: process.env.PRAXIS_SEAL_SECRET,
    });
  }
  return reader;
}

function normalize(addr: string): string {
  return addr.toLowerCase();
}

function serializeReceipt(e: ReceiptEvent, abortedSet: Set<string>): SerializedReceipt {
  const receiptId = e.receipt_id;
  return {
    receiptId,
    agent: e.agent,
    wallet: e.wallet,
    recipient: e.recipient,
    amount: String(e.amount),
    riskScore: Number(e.risk_score),
    simPassed: Boolean(e.sim_passed),
    sealed: Boolean(e.sealed),
    blobId: bytesToString(e.walrus_blob_id),
    timestampMs: Number(e.timestamp_ms),
    status: abortedSet.has(receiptId) ? "aborted" : "confirmed",
  };
}

function serializeAbort(e: AbortEvent): SerializedAbort {
  return {
    agent: e.agent,
    wallet: e.wallet,
    blobId: bytesToString(e.walrus_blob_id),
    reasonCode: Number(e.reason_code),
    reasonLabel: reasonCodeLabel(Number(e.reason_code)),
    riskScore: Number(e.risk_score),
    timestampMs: Number(e.timestamp_ms),
  };
}

export async function getIndexStats(): Promise<SerializedIndexStats> {
  return cached("indexStats", READ_TTL_MS, async () => {
    const s = await getReader().indexStats();
    return { totalCount: s.totalCount, totalAborts: s.totalAborts, abortRate: s.abortRate };
  });
}

export async function getReceiptsByAgent(
  agent: string,
  limit = 200,
): Promise<SerializedReceipt[]> {
  const events = await getReader().byAgent(agent, limit);
  const abortedSet = new Set<string>();
  return events.map((e) => serializeReceipt(e, abortedSet));
}

function serializeStreamEntry(e: StreamEntry): SerializedStreamEntry {
  return {
    kind: e.kind,
    status: e.status,
    agent: e.agent,
    wallet: e.wallet,
    recipient: e.recipient,
    amount: String(e.amount),
    riskScore: Number(e.risk_score),
    sealed: Boolean(e.sealed),
    blobId: bytesToString(e.walrus_blob_id),
    timestampMs: Number(e.timestamp_ms),
    receiptId: e.receipt_id,
    abortReason: e.abort_reason,
  };
}

/**
 * The unified spend stream: confirmed and aborted spends interleaved by time,
 * newest first. Backed by PraxisReader.stream(). This is the main feed; aborts
 * are first-class rows here, not a separate surface (DESIGN.md section 5).
 */
export async function getStream(limit = 50): Promise<SerializedStreamEntry[]> {
  return cached(`stream:${limit}`, READ_TTL_MS, async () => {
    const entries = await getReader().stream(limit);
    return entries.map(serializeStreamEntry);
  });
}

/**
 * Read a single receipt directly from its on-chain object, so the
 * /app/spend/[id] route is deep-linkable even when the receipt is older than the
 * recent-event window. `sealed` is derived from a non-empty seal_policy_id (the
 * object carries no explicit sealed flag; the event does). Returns null if the
 * id is not a Praxis receipt.
 */
export async function getReceiptById(receiptId: string): Promise<SerializedReceipt | null> {
  try {
    const obj = await getReader().client.getObject({
      id: receiptId,
      options: { showContent: true },
    });
    const content = obj.data?.content as
      | { dataType?: string; fields?: Record<string, unknown> }
      | undefined;
    const fields = content?.fields;
    if (!fields || content?.dataType !== "moveObject") return null;

    const blobBytes = fields.walrus_blob_id;
    const blobId = Array.isArray(blobBytes) ? bytesToString(blobBytes as number[]) : "";
    const sealPolicy = fields.seal_policy_id;
    const sealed = Array.isArray(sealPolicy) && sealPolicy.length > 0;

    return {
      receiptId,
      agent: String(fields.agent ?? ""),
      wallet: String(fields.wallet ?? ""),
      recipient: String(fields.recipient ?? ""),
      amount: String(fields.amount ?? "0"),
      riskScore: Number(fields.risk_score ?? 0),
      simPassed: Boolean(fields.sim_passed),
      sealed,
      blobId,
      timestampMs: Number(fields.timestamp_ms ?? 0),
      status: "confirmed",
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a deep-link id to a unified stream entry plus its reasoning blob,
 * branching on what the id is:
 *  - a Sui object id (0x-prefixed) is a confirmed-spend receipt. Read the receipt
 *    object, then its reasoning blob.
 *  - anything else is treated as a Walrus blob id for an aborted spend (aborts
 *    carry no receipt id). Read the reasoning blob and build the entry from it.
 * Returns null when neither resolves, so the route can render not-found.
 */
export async function getSpendDetail(
  id: string,
): Promise<{ entry: SerializedStreamEntry; reasoning: SerializedReasoningResult } | null> {
  // Confirmed path: a 0x-prefixed id is a receipt object.
  if (id.startsWith("0x")) {
    const receipt = await getReceiptById(id);
    if (receipt) {
      const reasoning = await getReasoning(receipt.blobId);
      const entry: SerializedStreamEntry = {
        kind: "spend",
        status: "confirmed",
        agent: receipt.agent,
        wallet: receipt.wallet,
        recipient: receipt.recipient,
        amount: receipt.amount,
        riskScore: receipt.riskScore,
        sealed: receipt.sealed,
        blobId: receipt.blobId,
        timestampMs: receipt.timestampMs,
        receiptId: receipt.receiptId,
      };
      return { entry, reasoning };
    }
    // A 0x id that is not a Praxis receipt resolves to nothing.
    return null;
  }

  // Abort path: treat the id as a Walrus blob id and source detail from the blob.
  const reasoning = await getReasoning(id);
  if (reasoning.sealed) {
    // Sealed abort blob: we cannot read intent server-side, but the entry can
    // still render its header and gate the reveal to an allowlisted viewer.
    const entry: SerializedStreamEntry = {
      kind: "abort",
      status: "aborted",
      agent: "",
      wallet: "",
      recipient: "",
      amount: "0",
      riskScore: 0,
      sealed: true,
      blobId: id,
      timestampMs: 0,
    };
    return { entry, reasoning };
  }
  if (reasoning.reasoning && reasoning.reasoning.outcome === "aborted") {
    const r = reasoning.reasoning;
    const entry: SerializedStreamEntry = {
      kind: "abort",
      status: "aborted",
      agent: r.agent,
      wallet: r.wallet,
      recipient: r.intent.to,
      amount: r.intent.amount,
      riskScore: r.simulation.riskScore,
      sealed: false,
      blobId: id,
      timestampMs: r.ts,
      abortReason: r.abortReason ?? undefined,
    };
    return { entry, reasoning };
  }
  return null;
}

export async function getRecentAborts(limit = 100): Promise<SerializedAbort[]> {
  const events = await getReader().aborts(limit);
  return events.map(serializeAbort);
}

export async function getAbortsByAgent(
  agent: string,
  limit = 200,
): Promise<SerializedAbort[]> {
  const events = await getReader().abortsByAgent(agent, limit);
  return events.map(serializeAbort);
}

/**
 * Derive the distinct agent set from recent receipts and aborts (DESIGN.md
 * resolved Q3: client-side derivation, no indexer). Returns one summary per
 * agent, newest activity first.
 */
export async function getAgents(limit = 200): Promise<SerializedAgent[]> {
  return cached(`agents:${limit}`, READ_TTL_MS, () => computeAgents(limit));
}

async function computeAgents(limit: number): Promise<SerializedAgent[]> {
  const r = getReader();
  const [receipts, aborts] = await Promise.all([r.recent(limit), r.aborts(limit)]);
  const map = new Map<string, SerializedAgent>();

  const ensure = (addr: string): SerializedAgent => {
    const key = normalize(addr);
    let entry = map.get(key);
    if (!entry) {
      entry = {
        address: addr,
        spendCount: 0,
        abortCount: 0,
        abortRate: 0,
        lastActivityMs: 0,
        riskMix: { low: 0, medium: 0, high: 0, critical: 0 },
      };
      map.set(key, entry);
    }
    return entry;
  };

  for (const e of receipts) {
    const a = ensure(e.agent);
    a.spendCount += 1;
    a.riskMix[scoreToBand(Number(e.risk_score))] += 1;
    a.lastActivityMs = Math.max(a.lastActivityMs, Number(e.timestamp_ms));
  }
  for (const e of aborts) {
    const a = ensure(e.agent);
    a.abortCount += 1;
    a.riskMix[scoreToBand(Number(e.risk_score))] += 1;
    a.lastActivityMs = Math.max(a.lastActivityMs, Number(e.timestamp_ms));
  }

  for (const a of map.values()) {
    const denom = a.spendCount + a.abortCount;
    a.abortRate = denom === 0 ? 0 : a.abortCount / denom;
  }

  return [...map.values()].sort((x, y) => y.lastActivityMs - x.lastActivityMs);
}

function serializeReasoning(b: ReasoningBlob): SerializedReasoning {
  return {
    v: 2,
    type: b.type,
    agent: b.agent,
    wallet: b.wallet,
    ts: b.ts,
    intent: {
      to: b.intent.to,
      amount: String(b.intent.amount),
      coinType: b.intent.coin_type,
      reasoning: {
        prompt: b.intent.reasoning.prompt,
        decision: b.intent.reasoning.decision,
        model: b.intent.reasoning.model,
      },
    },
    simulation: {
      success: b.simulation.success,
      balanceChanges: b.simulation.balance_changes,
      gasEstimate: String(b.simulation.gas_estimate),
      riskScore: b.simulation.risk_score,
      risks: b.simulation.risks,
      recommendation: b.simulation.recommendation,
    },
    policyCheck: {
      passed: b.policy_check.passed,
      violations: b.policy_check.violations,
    },
    outcome: b.outcome,
    abortReason: b.abort_reason,
    blake3: b.blake3,
  };
}

/** Fetch a reasoning blob. Sealed blobs return a marker, never plaintext. */
export async function getReasoning(blobId: string): Promise<SerializedReasoningResult> {
  try {
    const res = await getReader().reasoning(blobId);
    if (res.sealed) {
      return { sealed: true, policyId: res.policyId, auditors: res.auditors };
    }
    return { sealed: false, reasoning: serializeReasoning(res.blob) };
  } catch (err) {
    return {
      sealed: false,
      reasoning: null,
      error: err instanceof Error ? err.message : "Could not load the reasoning blob from Walrus.",
    };
  }
}

/**
 * Decrypt a sealed blob for a viewer who has proven control of their address.
 * Runs server-side only; the seal master secret never leaves this process.
 * Returns 401 when the signature does not prove control of `viewer`, and 403
 * when the (proven) viewer is not on the auditor allowlist.
 */
export async function revealReasoning(
  blobId: string,
  viewer: string,
  message: string,
  signature: string,
): Promise<DecryptResult> {
  const auth = await verifyDecryptAuth({ blobId, viewer, message, signature });
  if (!auth.ok) {
    return { ok: false, status: 401, error: auth.error };
  }
  try {
    const blob = await getReader().reveal(blobId, viewer);
    return { ok: true, reasoning: serializeReasoning(blob) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Decrypt failed.";
    const denied = message.toLowerCase().includes("allowlist");
    if (denied) {
      // Re-read the marker to surface the auditor count for the empty state.
      let auditorCount: number | undefined;
      try {
        const res = await getReader().reasoning(blobId);
        if (res.sealed) auditorCount = res.auditors.length;
      } catch {
        auditorCount = undefined;
      }
      return {
        ok: false,
        status: 403,
        error: "viewer is not in the auditor allowlist",
        auditorCount,
      };
    }
    return { ok: false, status: 500, error: message };
  }
}
