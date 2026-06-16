import { Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/cn";

/** Reasoning privacy badge. Sealed uses the brand accent + lock; public is muted. */
export function SealBadge({ sealed, className }: { sealed: boolean; className?: string }) {
  if (sealed) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-0.5 text-[12px] font-medium leading-[16px]",
          className,
        )}
        style={{ backgroundColor: "var(--accent-tint)", color: "var(--accent)" }}
      >
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        Sealed
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-0.5 text-[12px] font-medium leading-[16px] text-[var(--text-low)]",
        className,
      )}
    >
      <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
      Public
    </span>
  );
}
