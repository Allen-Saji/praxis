"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, Bot, FileText, BookOpen, LayoutDashboard } from "lucide-react";
import { normalizeSuiAddress } from "@mysten/sui/utils";

/**
 * Cmd+K command palette (borrowed from the Linear reference). Jump to an agent
 * by address, open a spend by receipt id, or navigate. The real navigation for
 * the dashboard, not just a search box.
 */
type Action = { id: string; label: string; hint: string; icon: typeof Bot; run: () => void };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trimmed = query.trim();
  const looksLikeAddress = /^0x[0-9a-fA-F]+$/.test(trimmed);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const dynamicActions: Action[] = [];
  if (looksLikeAddress) {
    let normalized = trimmed;
    try {
      normalized = normalizeSuiAddress(trimmed);
    } catch {
      normalized = trimmed;
    }
    dynamicActions.push({
      id: "open-agent",
      label: `Open agent ${trimmed.slice(0, 10)}...`,
      hint: "agent profile",
      icon: Bot,
      run: () => go(`/app/agents/${normalized}`),
    });
    dynamicActions.push({
      id: "open-spend",
      label: `Open spend ${trimmed.slice(0, 10)}...`,
      hint: "spend detail",
      icon: FileText,
      run: () => go(`/app/spend/${normalized}`),
    });
  }

  const staticActions: Action[] = [
    { id: "dash", label: "Go to dashboard", hint: "/app", icon: LayoutDashboard, run: () => go("/app") },
    { id: "agents", label: "Go to agents", hint: "/app/agents", icon: Bot, run: () => go("/app/agents") },
    { id: "docs", label: "Open the docs", hint: "/docs", icon: BookOpen, run: () => go("/docs") },
  ];

  const filtered = staticActions.filter((a) =>
    a.label.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const actions = [...dynamicActions, ...filtered];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-enter fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className="glass-solid fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-[var(--r-lg)] focus:outline-none"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <Search className="h-4 w-4 text-[var(--text-low)]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to an agent or spend by address, or a page..."
              className="w-full bg-transparent text-[14px] text-[var(--text-hi)] placeholder:text-[var(--text-low)] focus:outline-none"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto p-2">
            {actions.length === 0 ? (
              <li className="px-3 py-4 text-center text-[13px] text-[var(--text-low)]">
                No matches. Paste a 0x address to open an agent or spend.
              </li>
            ) : (
              actions.map((a) => {
                const Icon = a.icon;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={a.run}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--r-sm)] px-3 py-2 text-left transition-colors duration-150 hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
                    >
                      <span className="flex items-center gap-2.5 text-[14px] text-[var(--text-hi)]">
                        <Icon className="h-4 w-4 text-[var(--text-mid)]" />
                        {a.label}
                      </span>
                      <span className="font-mono text-[12px] text-[var(--text-low)]">{a.hint}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
