"use client";

import { Drawer } from "@/components/primitives/Drawer";
import { Spinner } from "@/components/primitives/Spinner";
import { SpendDetail, SpendDetailHeader } from "./SpendDetail";
import { useReasoning } from "@/lib/hooks/useReasoning";
import type { SerializedStreamEntry } from "@/lib/serialized";

/**
 * Right-side drawer for a quick look at a spend or a blocked one. Fetches the
 * reasoning blob client-side (route handler) once open. Confirmed and aborted
 * entries render the same SpendDetail body. The full deep-linkable variant lives
 * at /app/spend/[id] (DESIGN.md resolved Q4).
 */
export function SpendDrawer({
  entry,
  open,
  onOpenChange,
}: {
  entry: SerializedStreamEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { reasoning, isLoading } = useReasoning(open && entry ? entry.blobId : null);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? <SpendDetailHeader entry={entry} /> : null}
    >
      {entry ? (
        isLoading || !reasoning ? (
          <div className="flex items-center gap-2 py-12 text-[14px] text-[var(--text-mid)]">
            <Spinner className="h-4 w-4" />
            Loading reasoning from Walrus...
          </div>
        ) : (
          <SpendDetail entry={entry} reasoning={reasoning} />
        )
      ) : null}
    </Drawer>
  );
}
