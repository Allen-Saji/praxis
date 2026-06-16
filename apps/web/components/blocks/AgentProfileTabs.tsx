"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/primitives/Tabs";
import { SpendHistoryTable } from "./SpendHistoryTable";
import { AbortTimeline } from "./AbortTimeline";
import type { SerializedReceipt, SerializedAbort } from "@/lib/serialized";

/** Spend history / abort timeline tabs on the agent profile. */
export function AgentProfileTabs({
  receipts,
  aborts,
}: {
  receipts: SerializedReceipt[];
  aborts: SerializedAbort[];
}) {
  return (
    <Tabs defaultValue="history" className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="history">Spend history</TabsTrigger>
        <TabsTrigger value="aborts">
          Abort timeline
          {aborts.length > 0 ? (
            <span className="ml-1.5 tabular font-mono text-[12px] text-[var(--text-low)]">
              {aborts.length}
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="history">
        <SpendHistoryTable receipts={receipts} />
      </TabsContent>

      <TabsContent value="aborts">
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--panel)] p-5">
          <h3 className="mb-4 text-[15px] font-semibold text-[var(--text-hi)]">
            Abort timeline
          </h3>
          <AbortTimeline aborts={aborts} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
