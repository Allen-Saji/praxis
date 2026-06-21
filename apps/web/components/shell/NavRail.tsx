"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Bot, BookOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Wordmark } from "@/components/brand/Wordmark";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const ITEMS: NavItem[] = [
  {
    href: "/app",
    label: "Dashboard",
    icon: LayoutDashboard,
    match: (p) => p === "/app",
  },
  {
    href: "/app/agents",
    label: "Agents",
    icon: Bot,
    match: (p) => p.startsWith("/app/agents"),
  },
  {
    href: "/docs",
    label: "Docs",
    icon: BookOpen,
    match: (p) => p.startsWith("/docs"),
  },
];

export function NavRail() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 flex-col gap-1 border-r border-white/5 bg-[rgba(11,13,17,0.4)] p-3 backdrop-blur-xl md:w-52"
    >
      <Link
        href="/"
        className="mb-3 flex items-center px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        aria-label="Praxis home"
      >
        <Wordmark className="hidden text-[20px] md:inline" />
        <Wordmark monogram className="text-[20px] md:hidden" />
      </Link>
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-[var(--r-sm)] px-2.5 py-2 text-[14px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              active
                ? "bg-[var(--accent-tint)] text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(0,210,255,0.25)]"
                : "text-[var(--text-mid)] hover:bg-white/5 hover:text-[var(--text-hi)]",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
