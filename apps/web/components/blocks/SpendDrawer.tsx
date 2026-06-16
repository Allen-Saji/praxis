"use client";

import { Drawer } from "@/components/primitives/Drawer";
import { Spinner } from "@/components/primitives/Spinner";
import { SpendDetail, SpendDetailHeader } from "./SpendDetail";
import { useReasoning } from "@/lib/hooks/useReasoning";
import type { SerializedReceipt } from "@/lib/serialized";

/**
 * Right-side drawer for a quick look at a spend. Fetches the reasoning blob
 * client-side (route handler) once open. The full deep-linkable variant lives at
 * /app/spend/[id]; both render the same SpendDetail body (DESIGN.md resolved Q4).
 */
export function SpendDrawer({
  receipt,
  open,
  onOpenChange,
}: {
  receipt: SerializedReceipt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { reasoning, isLoading } = useReasoning(open && receipt ? receipt.blobId : null);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={receipt ? <SpendDetailHeader receipt={receipt} /> : null}
    >
      {receipt ? (
        isLoading || !reasoning ? (
          <div className="flex items-center gap-2 py-12 text-[14px] text-[var(--text-mid)]">
            <Spinner className="h-4 w-4" />
            Loading reasoning from Walrus...
          </div>
        ) : (
          <SpendDetail receipt={receipt} reasoning={reasoning} />
        )
      ) : null}
    </Drawer>
  );
}
