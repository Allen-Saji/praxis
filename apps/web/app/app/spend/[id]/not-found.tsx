import Link from "next/link";
import { FileX } from "lucide-react";

export default function SpendNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text-mid)]">
        <FileX className="h-5 w-5" />
      </span>
      <h1 className="text-[20px] font-semibold text-[var(--text-hi)]">Spend not found</h1>
      <p className="text-[14px] leading-[20px] text-[var(--text-mid)]">
        No Praxis receipt resolves to that id on testnet. It may be from another network or not be
        a receipt object.
      </p>
      <Link
        href="/app"
        className="inline-flex h-9 items-center rounded-[var(--r-sm)] border border-[var(--border-hi)] bg-[var(--panel)] px-4 text-[14px] text-[var(--text-hi)] transition-colors duration-150 hover:bg-[var(--panel-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
