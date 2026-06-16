"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  children,
  content,
  side = "top",
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 max-w-xs rounded-[var(--r-sm)] border border-[var(--border-hi)] bg-[var(--panel-2)] px-2.5 py-1.5 text-[12px] leading-[16px] text-[var(--text-hi)] shadow-[0_8px_24px_rgba(0,0,0,0.5)]",
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--border-hi)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
