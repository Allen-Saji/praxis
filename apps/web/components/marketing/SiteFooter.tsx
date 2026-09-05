import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { SOCIAL_HANDLE, SOCIAL_URL } from "@/lib/brand";
import { truncateMiddle } from "@/lib/format";

/** Landing/docs footer: links, the testnet package id, GitHub. */
export function SiteFooter({ packageId }: { packageId: string }) {
  return (
    <footer className="border-t border-white/5 bg-[rgba(9,11,15,0.4)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Wordmark className="text-[20px]" />
          <span className="text-[12px] text-[var(--text-low)]">
            Spending controls for AI agents. Sui Testnet preview.
          </span>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <div className="flex flex-wrap items-center gap-x-4 text-[13px]">
            <Link
              href={SOCIAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Praxis Guard on X"
              className="inline-flex min-h-11 items-center justify-center text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {SOCIAL_HANDLE}
            </Link>
            <Link
              href="/docs"
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--text-hi)]"
            >
              Docs
            </Link>
            <Link
              href="/app"
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--text-hi)]"
            >
              Open app
            </Link>
            <Link
              href="https://github.com/Allen-Saji/praxis"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--text-hi)]"
            >
              GitHub
            </Link>
          </div>

        </div>
      </div>
    </footer>
  );
}
