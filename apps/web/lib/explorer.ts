/**
 * Suiscan / SuiVision deep-link builders by object kind. Suiscan is primary
 * (DESIGN.md section 9), SuiVision is the fallback. Network is testnet in v1.
 */

const SUISCAN = "https://suiscan.xyz/testnet";
const SUIVISION = "https://testnet.suivision.xyz";

export type ExplorerKind = "account" | "object" | "tx" | "coin";

export function suiscanUrl(kind: ExplorerKind, value: string): string {
  return `${SUISCAN}/${kind}/${value}`;
}

export function suivisionUrl(kind: ExplorerKind, value: string): string {
  // SuiVision uses /txblock for transactions, otherwise /object|/account|/coin.
  const path = kind === "tx" ? "txblock" : kind;
  return `${SUIVISION}/${path}/${value}`;
}

/** Walrus aggregator URL for a blob id. */
export function walrusBlobUrl(blobId: string): string {
  return `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`;
}
