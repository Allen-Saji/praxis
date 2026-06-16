"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Inbox } from "lucide-react";
import { DataTable, type Column } from "./DataTable";
import { SpendDrawer } from "./SpendDrawer";
import { EmptyState } from "./EmptyState";
import { Address } from "@/components/data/Address";
import { Amount } from "@/components/data/Amount";
import { RiskScore } from "@/components/data/RiskScore";
import { StatusBadge } from "@/components/data/StatusBadge";
import { SealBadge } from "@/components/data/SealBadge";
import { Timestamp } from "@/components/data/Timestamp";
import { useReceipts } from "@/lib/hooks/useReceipts";
import { withThousands } from "@/lib/format";
import { INSTALL_SPEND_SNIPPET } from "@/lib/snippets";
import type { SerializedReceipt } from "@/lib/serialized";

/**
 * The live receipt feed. DataTable bound to /api/receipts via SWR (5s poll). A
 * "live" dot pulses while polling; a pause control freezes the feed for reading.
 * The newest row gets a one-time fade-slide on insertion (never a cascade).
 * Clicking a row opens the SpendDrawer (DESIGN.md sections 8, 9, resolved Q2/Q4).
 */
export function LiveSpendStream({ initial }: { initial: SerializedReceipt[] }) {
  const [live, setLive] = useState(true);
  const { receipts } = useReceipts({ initial, live });

  const [selected, setSelected] = useState<SerializedReceipt | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Track the newest receipt id so we can flag the just-inserted row for the
  // one-row enter animation, without cascading the whole list.
  const prevTopRef = useRef<string | null>(receipts[0]?.receiptId ?? null);
  const [enteredId, setEnteredId] = useState<string | null>(null);
  useEffect(() => {
    const top = receipts[0]?.receiptId ?? null;
    if (top && top !== prevTopRef.current) {
      setEnteredId(top);
      prevTopRef.current = top;
      const t = setTimeout(() => setEnteredId(null), 400);
      return () => clearTimeout(t);
    }
  }, [receipts]);

  const columns: Column<SerializedReceipt>[] = [
    {
      id: "time",
      header: "Time",
      cell: (r) => <Timestamp ms={r.timestampMs} />,
      sortValue: (r) => r.timestampMs,
      width: "w-28",
    },
    {
      id: "agent",
      header: "Agent",
      cell: (r) => <Address value={r.agent} kind="account" copy={false} link={false} />,
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

  const onRowClick = (r: SerializedReceipt) => {
    setSelected(r);
    setDrawerOpen(true);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold leading-[24px] text-[var(--text-hi)]">
          Live spend stream
        </h2>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-mid)]">
            <span
              className={`h-2 w-2 rounded-full ${live ? "live-dot bg-[var(--accent)]" : "bg-[var(--text-low)]"}`}
              aria-hidden="true"
            />
            {live ? "live" : "paused"}
          </span>
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            aria-pressed={!live}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border)] px-2.5 text-[13px] text-[var(--text-mid)] transition-colors duration-150 hover:bg-[var(--panel-2)] hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {live ? "Pause" : "Resume"}
          </button>
          <span className="tabular font-mono text-[13px] text-[var(--text-low)]">
            {withThousands(String(receipts.length))} shown
          </span>
        </div>
      </div>

      <DataTable
        ariaLabel="Live spend stream"
        columns={columns}
        rows={receipts}
        getRowKey={(r) => r.receiptId}
        onRowClick={onRowClick}
        rowClassName={(r) => (r.receiptId === enteredId ? "row-enter" : undefined)}
        initialSort={{ columnId: "time", dir: "desc" }}
        emptyState={
          <EmptyState
            icon={Inbox}
            headline="No spends recorded yet."
            body="Run a spend through the SDK and it shows up here within a few seconds."
            snippet={INSTALL_SPEND_SNIPPET}
          />
        }
      />

      <SpendDrawer receipt={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
