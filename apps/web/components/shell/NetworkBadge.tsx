"use client";

import { AlertTriangle } from "lucide-react";
import { Tooltip } from "@/components/primitives/Tooltip";
import { truncateMiddle } from "@/lib/format";

/**
 * Network badge: shows "testnet" with the live package short form. Turns to a
 * warning style if the deployment package is missing (0x0).
 */
export function NetworkBadge({ packageId }: { packageId: string }) {
  const missing = !packageId || packageId === "0x0";
  if (missing) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1 text-[12px] font-medium"
        style={{ backgroundColor: "rgba(251,146,60,0.14)", color: "var(--risk-high)" }}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        no deployment
      </span>
    );
  }
  return (
    <Tooltip content={`Reading testnet. Package ${truncateMiddle(packageId, 6, 4)}.`}>
      <span className="inline-flex cursor-default items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[12px] font-medium text-[var(--text-mid)]">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--risk-low)]" aria-hidden="true" />
        testnet
      </span>
    </Tooltip>
  );
}
