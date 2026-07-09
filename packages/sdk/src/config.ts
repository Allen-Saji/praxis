import type { Network } from "./types";

export interface Deployment {
  packageId: string;
  agentIndexId: string;
  /** AgentCap minted to the operator at publish; required to record spends/aborts. */
  agentCapId: string;
  clockId: string;
}

/**
 * Deployed praxis_core addresses. Testnet is live; mainnet is post-hackathon.
 * The cap gate (record_spend/record_abort require AgentCap) is live as of the
 * 2026-06-19 publish below. A fresh `pnpm deploy:move` mints a new package +
 * AgentIndex + AgentCap and rewrites deployments/testnet.json; sync the four
 * ids here afterward. The AgentCap is owned by the publisher (the operator).
 */
export const DEPLOYMENTS: Record<Network, Deployment> = {
  testnet: {
    packageId: "0x187af7061ca3bb3f22bd6aca39dc7570b5f3bd89b1a1f7eb9f801492ace4a46f",
    agentIndexId: "0xac8df4977168b2c158be0290e6dd52d30da5af8b4e09a03d9b6aba58a73df9fd",
    agentCapId: "0x97cf8d9ba91c06b7ac38906b7a255ad2cb688daba24e3ee56b6a15fc89bc511e",
    clockId: "0x6",
  },
  mainnet: {
    packageId: "0x0",
    agentIndexId: "0x0",
    agentCapId: "0x0",
    clockId: "0x6",
  },
};

/**
 * Default JSON-RPC endpoints. Mysten retired public JSON-RPC on
 * `fullnode.<net>.sui.io` (it returns 404 as of 2026-07), yet the SDK helper
 * `getJsonRpcFullnodeUrl` still points there, which broke every read. We carry
 * our own working defaults instead. Testnet uses a provider that still serves
 * full historical events (queryEvents), which the reader depends on; the common
 * public nodes prune event history and cannot reconstruct older receipts.
 * Override per instance with the `rpcUrl` option, or globally with the
 * `SUI_RPC_URL` env var (server) / `NEXT_PUBLIC_SUI_RPC_URL` (browser).
 */
export const SUI_RPC_ENDPOINTS: Record<Network, string> = {
  testnet: "https://sui-testnet-endpoint.blockvision.org",
  mainnet: "https://sui-mainnet-endpoint.blockvision.org",
};

/**
 * Resolve the RPC url for a network: explicit override > SUI_RPC_URL env >
 * built-in default. The `process` guard keeps this safe in the browser bundle,
 * where env reads happen at build time via NEXT_PUBLIC_ vars instead.
 */
export function resolveRpcUrl(network: Network, override?: string): string {
  if (override) return override;
  const fromEnv =
    typeof process !== "undefined" ? process.env?.SUI_RPC_URL : undefined;
  return fromEnv || SUI_RPC_ENDPOINTS[network];
}

export const WALRUS_ENDPOINTS: Record<Network, { publisher: string; aggregator: string }> = {
  testnet: {
    publisher: "https://publisher.walrus-testnet.walrus.space",
    aggregator: "https://aggregator.walrus-testnet.walrus.space",
  },
  mainnet: {
    publisher: "https://publisher.walrus-mainnet.walrus.space",
    aggregator: "https://aggregator.walrus-mainnet.walrus.space",
  },
};

export const SUI_TYPE = "0x2::sui::SUI";
