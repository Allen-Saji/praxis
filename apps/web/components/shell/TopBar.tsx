"use client";

import { NetworkBadge } from "./NetworkBadge";
import { ViewerControl } from "./ViewerControl";
import { Kbd } from "@/components/primitives/Kbd";

/** Dashboard top bar: network badge, connected viewer, Cmd+K hint. */
export function TopBar({ packageId }: { packageId: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/5 bg-[rgba(11,13,17,0.4)] px-4 backdrop-blur-xl">
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
