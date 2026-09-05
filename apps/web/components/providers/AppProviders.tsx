"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { useState } from "react";

import "@mysten/dapp-kit/dist/index.css";

// dapp-kit configures its own browser wallet transport. The SDK's server-side
// audit reader uses gRPC and GraphQL, so this provider remains isolated from it.
const DEFAULT_TESTNET_RPC = "https://sui-testnet-endpoint.blockvision.org";
const networks = {
  testnet: {
    url: process.env.NEXT_PUBLIC_SUI_RPC_URL ?? DEFAULT_TESTNET_RPC,
  },
};

/** Wallet transport and query cache for the authenticated workspace UI. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
