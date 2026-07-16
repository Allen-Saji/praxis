"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Column definition for the generic DataTable. Takes definitions + a row click
 * handler, not a pile of showX flags (composition guidelines). `sortValue`
 * makes a column sortable; `align` right-aligns numeric/mono columns so digits
 * line up by place value (Setproduct reference).
 */
export interface Column<T> {
  id: string;
  header: string;
  /** Cell renderer. */
  cell: (row: T) => React.ReactNode;
  /** Mobile stacked-card label (defaults to header). */
  mobileLabel?: string;
  align?: "left" | "right";
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => number | string;
  /** Tailwind width hint, e.g. "w-32". */
  width?: string;
}

type SortState = { columnId: string; dir: "asc" | "desc" } | null;

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  rowClassName,
  initialSort,
  emptyState,
  ariaLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, index: number) => string | undefined;
  initialSort?: SortState;
  emptyState?: React.ReactNode;
  ariaLabel: string;
}) {
  const [sort, setSort] = useState<SortState>(initialSort ?? null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.columnId);
    if (!col?.sortValue) return rows;
    const getValue = col.sortValue;
    // toSorted keeps the source immutable.
    return rows.toSorted((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (prev?.columnId === col.id) {
        return { columnId: col.id, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { columnId: col.id, dir: "desc" };
    });
  };

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="evidence-surface overflow-hidden rounded-[var(--r-md)]">
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse" aria-label={ariaLabel}>
          <thead className="sticky top-0 z-10 bg-[rgba(16,18,22,0.92)] backdrop-blur-md">
            <tr className="border-b border-white/10">
              {columns.map((col) => {
                const sortable = Boolean(col.sortValue);
                const activeSort = sort?.columnId === col.id;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={
                      activeSort ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"
                    }
                    className={cn(
                      "h-10 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-mid)]",
                      col.align === "right" ? "text-right" : "text-left",
                      col.width,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className={cn(
                          "inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-1 transition-colors duration-150 hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                          col.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {col.header}
                        {activeSort ? (
                          sort?.dir === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )
                        ) : null}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
              {onRowClick ? <th className="w-10" aria-hidden="true" /> : null}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => {
              const interactive = Boolean(onRowClick);
              return (
                <tr
                  key={getRowKey(row, i)}
                  onClick={interactive ? () => onRowClick?.(row) : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick?.(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={interactive ? 0 : undefined}
                  role={interactive ? "button" : undefined}
                  className={cn(
                    "group border-b border-white/5 transition-colors duration-150 last:border-b-0",
                    interactive &&
                      "cursor-pointer hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]",
                    rowClassName?.(row, i),
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        "h-11 px-4 py-2 align-middle text-[14px]",
                        col.align === "right" ? "text-right" : "text-left",
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                  {interactive ? (
                    <td className="w-10 px-2 text-right align-middle">
                      <ChevronRight className="ml-auto h-4 w-4 text-[var(--text-low)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked key/value cards */}
      <div className="flex flex-col gap-px md:hidden">
        {sortedRows.map((row, i) => {
          const interactive = Boolean(onRowClick);
          return (
            <div
              key={getRowKey(row, i)}
              onClick={interactive ? () => onRowClick?.(row) : undefined}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick?.(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                "flex flex-col gap-2 border-b border-white/5 p-4 last:border-b-0",
                interactive && "cursor-pointer active:bg-white/5",
              )}
            >
              {columns.map((col) => (
                <div key={col.id} className="flex items-center justify-between gap-3">
                  <span className="text-[12px] uppercase tracking-[0.04em] text-[var(--text-mid)]">
                    {col.mobileLabel ?? col.header}
                  </span>
                  <span className="text-right text-[14px]">{col.cell(row)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
