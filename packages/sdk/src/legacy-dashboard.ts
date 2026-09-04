import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { resolveLegacyEventRpcUrl } from "./config";
import { PraxisSdkError } from "./errors";
import { resilientFetch } from "./rpc";
import type { Network } from "./types";

/**
 * Explicitly read-only bridge for historical dashboard events that predate
 * GraphQL retention. It must not be injected into execution or simulation.
 */
export interface LegacyDashboardEventBridge {
  queryEvents(input: {
    query: { MoveEventType: string };
    limit: number;
    order: "ascending" | "descending";
  }): Promise<{ data: Array<{ parsedJson: unknown }> }>;
}

/** Build the temporary, read-only dashboard bridge. */
export function makeLegacyDashboardEventBridge(network: Network, rpcUrl?: string): LegacyDashboardEventBridge {
  assertTestnet(network);
  const client = new SuiJsonRpcClient({
    network,
    transport: new JsonRpcHTTPTransport({
      url: resolveLegacyEventRpcUrl(network, rpcUrl),
      fetch: resilientFetch(),
    }),
  });
  return {
    queryEvents: async ({ query, limit, order }) => client.queryEvents({ query, limit, order }),
  };
}

/** @deprecated Use makeLegacyDashboardEventBridge for read-only dashboard history. */
export function makeLegacyEventClient(network: Network, rpcUrl?: string): SuiJsonRpcClient {
  assertTestnet(network);
  return new SuiJsonRpcClient({
    network,
    transport: new JsonRpcHTTPTransport({
      url: resolveLegacyEventRpcUrl(network, rpcUrl),
      fetch: resilientFetch(),
    }),
  });
}

function assertTestnet(network: Network): void {
  if (network !== "testnet") {
    throw new PraxisSdkError("CONFIGURATION_ERROR", "the legacy event bridge is Testnet dashboard-only");
  }
}
