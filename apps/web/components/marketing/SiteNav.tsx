import Link from "next/link";
import { ShieldCheck, Github } from "lucide-react";

/** Top nav for the landing/docs surface. */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[rgba(9,11,15,0.5)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center justify-between px-5">
        <Link
          href="/"
          className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <ShieldCheck className="h-5 w-5 text-[var(--accent)]" />
          <span className="text-[15px] font-semibold tracking-tight text-[var(--text-hi)]">
            Praxis
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-[14px]" aria-label="Primary">
          <Link
            href="/docs"
            className="rounded-[var(--r-sm)] px-3 py-1.5 text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Docs
          </Link>
          <Link
            href="/app"
            className="rounded-[var(--r-sm)] px-3 py-1.5 text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Dashboard
          </Link>
          <Link
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-mid)] transition-colors duration-150 hover:bg-white/10 hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <Github className="h-4 w-4" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
