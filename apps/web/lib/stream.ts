/**
 * Pure helpers for the unified spend stream. Client-safe (no Node built-ins, no
 * @allen-saji/praxis). A stream entry is either a confirmed spend (keyed by receiptId)
 * or an aborted spend (keyed by blobId, since aborts carry no receipt id).
 */
import type { SerializedReceipt, SerializedStreamEntry } from "./serialized";

/** Stable list key for a stream entry. */
export function streamKey(e: SerializedStreamEntry): string {
  return e.receiptId ?? `abort:${e.blobId}:${e.timestampMs}`;
}

/**
 * Adapt a confirmed-spend receipt into a unified stream entry so the agent
 * profile's spend-history table can open the same SpendDrawer as the live stream.
 * Receipts are always confirmed (a blocked spend never produces a receipt).
 */
export function receiptToEntry(r: SerializedReceipt): SerializedStreamEntry {
  return {
    kind: "spend",
    status: "confirmed",
    agent: r.agent,
    wallet: r.wallet,
    recipient: r.recipient,
    amount: r.amount,
    riskScore: r.riskScore,
    sealed: r.sealed,
    blobId: r.blobId,
    timestampMs: r.timestampMs,
    receiptId: r.receiptId,
  };
}

/**
 * Deep-link id for a stream entry: the receipt object id for confirmed spends,
 * the Walrus blob id for aborts. /app/spend/[id] detects which by the 0x prefix.
 */
export function detailId(e: SerializedStreamEntry): string {
  return e.kind === "spend" && e.receiptId ? e.receiptId : e.blobId;
}
