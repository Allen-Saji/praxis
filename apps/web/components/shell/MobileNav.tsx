"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./NavRail";

/** Thumb-reachable primary navigation for narrow app viewports. */
export function MobileNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Primary"
      className="grid shrink-0 grid-cols-3 border-t border-[var(--divider)] bg-[var(--workspace)] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-1 rounded-[var(--r-sm)] px-2 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              active
                ? "bg-[var(--accent-tint)] text-[var(--accent)]"
                : "text-[var(--text-mid)] hover:bg-white/5 hover:text-[var(--text-hi)]",
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
