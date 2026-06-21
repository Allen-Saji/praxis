"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Inbox } from "lucide-react";
import { DataTable, type Column } from "./DataTable";
import { SpendDrawer } from "./SpendDrawer";
import { EmptyState } from "./EmptyState";
import { Address } from "@/components/data/Address";
import { Amount } from "@/components/data/Amount";
import { RiskScore } from "@/components/data/RiskScore";
import { RiskBadge } from "@/components/data/RiskBadge";
import { StatusBadge } from "@/components/data/StatusBadge";
import { SealBadge } from "@/components/data/SealBadge";
import { Timestamp } from "@/components/data/Timestamp";
import { useStream } from "@/lib/hooks/useStream";
import { streamKey } from "@/lib/stream";
import { scoreToBand } from "@/lib/risk";
import { withThousands } from "@/lib/format";
import { INSTALL_SPEND_SNIPPET } from "@/lib/snippets";
import type { SerializedStreamEntry } from "@/lib/serialized";

/**
 * The unified live spend stream. DataTable bound to /api/stream via SWR (5s
 * poll). Confirmed spends and blocked ones are interleaved by time; blocked rows
 * lead with the aborted StatusBadge, a RiskBadge, and the abort reason, so the
 * thing Praxis prevented is the most legible row in the feed (DESIGN.md section
 * 5, "aborts are the hero"). A "live" dot pulses while polling; a pause control
 * freezes the feed for reading. The newest row gets a one-time fade-slide on
 * insertion (never a cascade). Clicking a row opens the SpendDrawer (sections 8,
 * 9, resolved Q2/Q4).
 */
export function LiveSpendStream({ initial }: { initial: SerializedStreamEntry[] }) {
  const [live, setLive] = useState(true);
  const { entries } = useStream({ initial, live });

  const [selected, setSelected] = useState<SerializedStreamEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Track the newest entry key so we can flag the just-inserted row for the
  // one-row enter animation, without cascading the whole list.
  const prevTopRef = useRef<string | null>(entries[0] ? streamKey(entries[0]) : null);
  const [enteredKey, setEnteredKey] = useState<string | null>(null);
  useEffect(() => {
    const top = entries[0] ? streamKey(entries[0]) : null;
    if (top && top !== prevTopRef.current) {
      setEnteredKey(top);
      prevTopRef.current = top;
      const t = setTimeout(() => setEnteredKey(null), 400);
      return () => clearTimeout(t);
    }
  }, [entries]);

  const columns: Column<SerializedStreamEntry>[] = [
    {
      id: "time",
      header: "Time",
      cell: (e) => <Timestamp ms={e.timestampMs} />,
      sortValue: (e) => e.timestampMs,
      width: "w-28",
    },
    {
      id: "agent",
      header: "Agent",
      cell: (e) => <Address value={e.agent} kind="account" copy={false} link={false} />,
    },
    {
      id: "recipient",
      header: "Recipient",
      cell: (e) => <Address value={e.recipient} kind="account" copy={false} link={false} />,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (e) => <Amount mist={e.amount} />,
      sortValue: (e) => Number(e.amount),
      width: "w-32",
    },
    {
      id: "risk",
      header: "Risk",
      align: "right",
      cell: (e) => <RiskScore score={e.riskScore} />,
      sortValue: (e) => e.riskScore,
      width: "w-40",
    },
    {
      id: "seal",
      header: "Reasoning",
      cell: (e) => <SealBadge sealed={e.sealed} />,
      width: "w-28",
    },
    {
      id: "status",
      header: "Status",
      align: "right",
      cell: (e) =>
        e.status === "aborted" ? (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <RiskBadge level={scoreToBand(e.riskScore)} showLabel={false} />
              <StatusBadge status="aborted" />
            </div>
            {e.abortReason ? (
              <span className="font-mono text-[12px] text-[var(--risk-critical)]">
                {e.abortReason}
              </span>
            ) : null}
          </div>
        ) : (
          <StatusBadge status="confirmed" />
        ),
      width: "w-44",
    },
  ];

  const onRowClick = (e: SerializedStreamEntry) => {
    setSelected(e);
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
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--r-sm)] border border-white/10 bg-white/5 px-2.5 text-[13px] text-[var(--text-mid)] transition-colors duration-150 hover:bg-white/10 hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {live ? "Pause" : "Resume"}
          </button>
          <span className="tabular font-mono text-[13px] text-[var(--text-low)]">
            {withThousands(String(entries.length))} shown
          </span>
        </div>
      </div>

      <DataTable
        ariaLabel="Live spend stream"
        columns={columns}
        rows={entries}
        getRowKey={(e) => streamKey(e)}
        onRowClick={onRowClick}
        rowClassName={(e) => (streamKey(e) === enteredKey ? "row-enter" : undefined)}
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

      <SpendDrawer entry={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
