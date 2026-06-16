"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Right-side drawer built on Radix Dialog. Slide-in is CSS (drawer-enter,
 * 280ms), gated on prefers-reduced-motion in globals.css. Used by SpendDrawer.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-enter fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "drawer-enter fixed top-0 right-0 z-40 flex h-full w-full max-w-[640px] flex-col border-l border-[var(--border-hi)] bg-[var(--panel)] shadow-[0_16px_48px_rgba(0,0,0,0.5)] focus:outline-none",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <Dialog.Title asChild>
              <div className="min-w-0">{title}</div>
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--r-sm)] text-[var(--text-mid)] transition-colors duration-150 hover:bg-[var(--panel-2)] hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
