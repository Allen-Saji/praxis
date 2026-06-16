"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

/**
 * The viewer is the Sui address passed to the decrypt allowlist check. Per the
 * resolved brief question, it comes from a read-only wallet connection
 * (@mysten/dapp-kit, wallet-standard) OR a manual address entry for the demo.
 * zkLogin is deferred; this context is the auth boundary it will slot into.
 *
 * No private key ever lives here. The address is the only thing the decrypt flow
 * needs, and the actual decrypt runs server-side.
 */
interface ViewerContextValue {
  /** The effective viewer address (wallet first, then manual), or null. */
  viewer: string | null;
  /** Whether the viewer came from a connected wallet vs manual entry. */
  source: "wallet" | "manual" | null;
  setManualViewer: (address: string | null) => void;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const account = useCurrentAccount();
  const [manual, setManual] = useState<string | null>(null);

  const setManualViewer = useCallback((address: string | null) => {
    setManual(address && address.trim() ? address.trim() : null);
  }, []);

  const value = useMemo<ViewerContextValue>(() => {
    if (account?.address) {
      return { viewer: account.address, source: "wallet", setManualViewer };
    }
    if (manual) {
      return { viewer: manual, source: "manual", setManualViewer };
    }
    return { viewer: null, source: null, setManualViewer };
  }, [account?.address, manual, setManualViewer]);

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) {
    throw new Error("useViewer must be used within a ViewerProvider");
  }
  return ctx;
}
