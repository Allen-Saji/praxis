"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("flex items-center gap-1 border-b border-[var(--border)]", className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "min-h-11 cursor-pointer border-b-2 border-transparent px-3 text-[14px] font-medium text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--text-hi)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("focus-visible:outline-none", className)}
      {...props}
    />
  );
}
