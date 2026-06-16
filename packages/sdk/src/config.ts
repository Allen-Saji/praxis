import type { Network } from "./types";

export interface Deployment {
  packageId: string;
  agentIndexId: string;
  clockId: string;
}

/** Deployed praxis_core addresses. Testnet is live; mainnet is post-hackathon. */
export const DEPLOYMENTS: Record<Network, Deployment> = {
  testnet: {
    packageId: "0xb9e95d52354fc86c1d85ed58f7d8b7e90c76347961da16cc6e95845e9b56e32d",
    agentIndexId: "0x42780ec3caadec6c9aaea33d9aee857c40dbf86edefadeaeebff7b01187069d7",
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
