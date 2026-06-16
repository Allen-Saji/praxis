"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import { DataTable, type Column } from "./DataTable";
import { SpendDrawer } from "./SpendDrawer";
import { EmptyState } from "./EmptyState";
import { Address } from "@/components/data/Address";
import { Amount } from "@/components/data/Amount";
import { RiskScore } from "@/components/data/RiskScore";
import { StatusBadge } from "@/components/data/StatusBadge";
import { SealBadge } from "@/components/data/SealBadge";
import { Timestamp } from "@/components/data/Timestamp";
import { withThousands } from "@/lib/format";
import { receiptToEntry } from "@/lib/stream";
import { INSTALL_SPEND_SNIPPET } from "@/lib/snippets";
import type { SerializedReceipt, SerializedStreamEntry } from "@/lib/serialized";

/**
 * A static spend-history table (no polling) used on the agent profile. Clicking
 * a row opens the same SpendDrawer as the live stream. Shows the sim outcome
 * column the dashboard stream omits.
 */
export function SpendHistoryTable({ receipts }: { receipts: SerializedReceipt[] }) {
  const [selected, setSelected] = useState<SerializedStreamEntry | null>(null);
  const [open, setOpen] = useState(false);

  const columns: Column<SerializedReceipt>[] = [
    {
      id: "time",
      header: "Time",
      cell: (r) => <Timestamp ms={r.timestampMs} />,
      sortValue: (r) => r.timestampMs,
      width: "w-28",
    },
    {
      id: "recipient",
      header: "Recipient",
      cell: (r) => <Address value={r.recipient} kind="account" copy={false} link={false} />,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (r) => <Amount mist={r.amount} />,
      sortValue: (r) => Number(r.amount),
      width: "w-32",
    },
    {
      id: "risk",
      header: "Risk",
      align: "right",
      cell: (r) => <RiskScore score={r.riskScore} />,
      sortValue: (r) => r.riskScore,
      width: "w-40",
    },
    {
      id: "sim",
      header: "Sim",
      cell: (r) => <StatusBadge status={r.simPassed ? "sim_passed" : "sim_failed"} />,
      width: "w-28",
    },
    {
      id: "seal",
      header: "Reasoning",
      cell: (r) => <SealBadge sealed={r.sealed} />,
      width: "w-28",
    },
    {
      id: "status",
      header: "Status",
      align: "right",
      cell: (r) => <StatusBadge status={r.status} />,
      width: "w-32",
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-[var(--text-hi)]">Spend history</h3>
        <span className="tabular font-mono text-[13px] text-[var(--text-low)]">
          {withThousands(String(receipts.length))} total
        </span>
      </div>
      <DataTable
        ariaLabel="Spend history"
        columns={columns}
        rows={receipts}
        getRowKey={(r) => r.receiptId}
        onRowClick={(r) => {
          setSelected(receiptToEntry(r));
          setOpen(true);
        }}
        initialSort={{ columnId: "time", dir: "desc" }}
        emptyState={
          <EmptyState
            icon={Inbox}
            headline="No spends recorded for this agent yet."
            body="Run a spend through the SDK with this agent identity and it shows up here."
            snippet={INSTALL_SPEND_SNIPPET}
          />
        }
      />
      <SpendDrawer entry={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
