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

/** Full-node gRPC-web endpoints used for live execution and current state. */
export const SUI_GRPC_ENDPOINTS: Record<Network, string> = {
  testnet: "https://fullnode.testnet.sui.io:443",
  mainnet: "https://fullnode.mainnet.sui.io:443",
};

/** Sui GraphQL endpoints used for historical event feeds. */
export const SUI_GRAPHQL_ENDPOINTS: Record<Network, string> = {
  testnet: "https://graphql.testnet.sui.io/graphql",
  mainnet: "https://graphql.mainnet.sui.io/graphql",
};

/**
 * Transitional event-history provider for Testnet records predating Sui
 * GraphQL retention. New control-plane records will live in PostgreSQL, which
 * removes this compatibility path before mainnet release.
 */
export const SUI_LEGACY_EVENT_RPC_ENDPOINTS: Record<Network, string> = {
  testnet: "https://sui-testnet-endpoint.blockvision.org",
  mainnet: "https://sui-mainnet-endpoint.blockvision.org",
};

/**
 * Resolve a gRPC endpoint: explicit override > SUI_GRPC_URL env > built-in
 * default. The `process` guard keeps this safe in browser bundles.
 */
export function resolveGrpcUrl(network: Network, override?: string): string {
  if (override) return override;
  const fromEnv =
    typeof process !== "undefined" ? process.env?.SUI_GRPC_URL : undefined;
  return fromEnv || SUI_GRPC_ENDPOINTS[network];
}

/** Resolve a GraphQL endpoint: explicit override > SUI_GRAPHQL_URL env > default. */
export function resolveGraphqlUrl(network: Network, override?: string): string {
  if (override) return override;
  const fromEnv =
    typeof process !== "undefined" ? process.env?.SUI_GRAPHQL_URL : undefined;
  return fromEnv || SUI_GRAPHQL_ENDPOINTS[network];
}

/** Resolve the temporary historical-event provider endpoint. */
export function resolveLegacyEventRpcUrl(network: Network, override?: string): string {
  if (override) return override;
  const fromEnv =
    typeof process !== "undefined" ? process.env?.SUI_LEGACY_EVENT_RPC_URL : undefined;
  return fromEnv || SUI_LEGACY_EVENT_RPC_ENDPOINTS[network];
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
