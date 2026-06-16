"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { relativeTime, absoluteTime } from "@/lib/format";

/**
 * Relative time ("2m ago") with the absolute UTC time on hover/title. Rendered
 * client-side so it stays current and avoids a server/client mismatch; before
 * mount it shows the absolute time so there is no hydration flicker.
 */
export function Timestamp({ ms, className }: { ms: number; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const absolute = absoluteTime(ms);
  const label = mounted ? relativeTime(ms) : absolute;

  return (
    <time
      dateTime={new Date(ms).toISOString()}
      title={absolute}
      className={cn("text-[13px] leading-[20px] text-[var(--text-low)]", className)}
    >
      {label}
    </time>
  );
}
