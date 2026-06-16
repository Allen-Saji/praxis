import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/** Indeterminate spinner. Honors prefers-reduced-motion via globals.css. */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("h-4 w-4 animate-spin text-current", className)}
      aria-hidden="true"
    />
  );
}
