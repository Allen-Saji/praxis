"use client";

import { useState } from "react";
import { Wallet, X, Check } from "lucide-react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useViewer } from "@/components/providers/ViewerProvider";
import { truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Supplies the viewer address for the decrypt allowlist check. Prefers a
 * read-only Sui wallet connection; if no wallet is available, allows a manual
 * address entry for the demo (resolved brief question 1). zkLogin is deferred;
 * this is the auth boundary it slots into. No private key is ever handled here.
 */
export function ViewerControl() {
  const account = useCurrentAccount();
  const { viewer, source, setManualViewer } = useViewer();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // A wallet is connected: show the connected address, let the wallet UI manage it.
  if (account?.address) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-[12px] text-[var(--text-mid)] sm:flex">
          <Check className="h-3.5 w-3.5 text-[var(--risk-low)]" />
          <span className="font-mono text-[var(--text-hi)]">{truncateMiddle(account.address)}</span>
          <span className="text-[var(--text-low)]">(you)</span>
        </span>
        <ConnectButton className="!h-8 !rounded-[var(--r-sm)] !border !border-[var(--border)] !bg-[var(--panel)] !px-2.5 !text-[12px] !text-[var(--text-mid)]" />
      </div>
    );
  }

  // Manual viewer already set.
  if (viewer && source === "manual") {
    return (
      <div className="flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5">
        <span className="font-mono text-[12px] text-[var(--text-hi)]">{truncateMiddle(viewer)}</span>
        <span className="text-[11px] text-[var(--text-low)]">(viewer)</span>
        <button
          type="button"
          aria-label="Clear viewer address"
          onClick={() => setManualViewer(null)}
          className="cursor-pointer text-[var(--text-low)] transition-colors duration-150 hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Manual entry form.
  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) {
            setManualViewer(draft);
            setEditing(false);
          }
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor="viewer-address" className="sr-only">
          Viewer address
        </label>
        <input
          id="viewer-address"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="0x... viewer address"
          className="h-8 w-56 rounded-[var(--r-sm)] border border-[var(--border-hi)] bg-[var(--panel)] px-2.5 font-mono text-[12px] text-[var(--text-hi)] placeholder:text-[var(--text-low)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        />
        <button
          type="submit"
          className={cn(
            "h-8 cursor-pointer rounded-[var(--r-sm)] bg-[var(--accent)] px-3 text-[12px] font-medium text-[var(--bg)] transition-colors duration-150 hover:bg-[var(--accent-quiet)]",
          )}
        >
          Set
        </button>
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => setEditing(false)}
          className="cursor-pointer text-[var(--text-low)] transition-colors duration-150 hover:text-[var(--text-hi)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </form>
    );
  }

  // Default: connect-or-enter affordance.
  return (
    <div className="flex items-center gap-2">
      <ConnectButton
        connectText={
          <span className="inline-flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            Connect wallet
          </span>
        }
        className="!h-8 !cursor-pointer !rounded-[var(--r-sm)] !border !border-[var(--border-hi)] !bg-[var(--panel)] !px-2.5 !text-[12px] !font-medium !text-[var(--text-hi)]"
      />
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="h-8 cursor-pointer rounded-[var(--r-sm)] px-2 text-[12px] text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        or enter address
      </button>
    </div>
  );
}
