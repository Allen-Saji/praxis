import { cn } from "@/lib/cn";

/** A keyboard-key hint, e.g. Cmd+K. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--panel-2)] px-1.5 font-mono text-[11px] text-[var(--text-mid)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
