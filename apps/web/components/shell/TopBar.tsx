"use client";

import { NetworkBadge } from "./NetworkBadge";
import { ViewerControl } from "./ViewerControl";
import { Kbd } from "@/components/primitives/Kbd";

/** Dashboard top bar: network badge, connected viewer, Cmd+K hint. */
export function TopBar({ packageId }: { packageId: string }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-[var(--divider)] bg-[var(--workspace)] px-3 sm:gap-4 sm:px-4">
      <div className="flex items-center gap-3">
        <NetworkBadge packageId={packageId} />
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden items-center gap-1.5 text-[12px] text-[var(--text-low)] md:flex">
          <Kbd>Cmd</Kbd>
          <Kbd>K</Kbd>
          <span>to jump</span>
        </span>
        <ViewerControl />
      </div>
    </header>
  );
}
