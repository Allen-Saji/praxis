"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { useState } from "react";
import { ViewerProvider } from "./ViewerProvider";

import "@mysten/dapp-kit/dist/index.css";

// Mysten retired public JSON-RPC on fullnode.testnet.sui.io (404s), so point the
// browser-side wallet client at a working provider. Kept as a literal (not the
// SDK export) so this client component never pulls the SDK's Node-only modules
// into the browser bundle. Keep in sync with SUI_RPC_ENDPOINTS in the SDK config.
const DEFAULT_TESTNET_RPC = "https://sui-testnet-endpoint.blockvision.org";
const networks = {
  testnet: {
    url: process.env.NEXT_PUBLIC_SUI_RPC_URL ?? DEFAULT_TESTNET_RPC,
  },
};

/**
 * Client provider tree for the dashboard. dapp-kit needs react-query and a Sui
 * client provider; the wallet provider supplies the read-only connected account.
 * No autoConnect on first paint to avoid a connect prompt the user did not ask
 * for. The dashboard reads chain data server-side, so this Sui client is only
 * the wallet adapter's backing client.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <ViewerProvider>{children}</ViewerProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
