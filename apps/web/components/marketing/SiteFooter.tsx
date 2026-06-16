import Link from "next/link";
import { truncateMiddle } from "@/lib/format";

/** Landing/docs footer: links, the testnet package id, GitHub. */
export function SiteFooter({ packageId }: { packageId: string }) {
  return (
    <footer className="border-t border-[var(--border)]">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-semibold text-[var(--text-hi)]">Praxis</span>
          <span className="text-[12px] text-[var(--text-low)]">
            A safety layer between your AI agent and its wallet. Testnet, SUI only in v1.
          </span>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <div className="flex items-center gap-4 text-[13px]">
            <Link
              href="/docs"
              className="text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--text-hi)]"
            >
              Docs
            </Link>
            <Link
              href="/app"
              className="text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--text-hi)]"
            >
              Dashboard
            </Link>
            <Link
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--text-hi)]"
            >
              GitHub
            </Link>
          </div>
          <span className="font-mono text-[11px] text-[var(--text-low)]" title={packageId}>
            testnet package {truncateMiddle(packageId, 6, 4)}
          </span>
        </div>
      </div>
    </footer>
  );
}
