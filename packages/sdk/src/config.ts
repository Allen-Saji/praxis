import type { Network } from "./types";

export interface Deployment {
  packageId: string;
  agentIndexId: string;
  clockId: string;
}

/** Deployed praxis_core addresses. Testnet is live; mainnet is post-hackathon. */
export const DEPLOYMENTS: Record<Network, Deployment> = {
  testnet: {
    packageId: "0x77b14929d5a7bf54145f6239f54f58f699343777ccca2152904ab45e382574dc",
    agentIndexId: "0xe142909ccb65a560a7c921e1990747cc08bddcb28424d8c7c40ed7f829f6aa99",
    clockId: "0x6",
  },
  mainnet: {
    packageId: "0x0",
    agentIndexId: "0x0",
    clockId: "0x6",
  },
};

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
