"use client";

/**
 * Adapted from React Bits "Count Up" (MIT + Commons Clause), retokenized and
 * trimmed to our needs: count up on mount, then tick to a new target when the
 * value changes. Dependency-free (no motion lib) so it stays light on the data
 * tool. Honors prefers-reduced-motion by snapping to the final value with no
 * animation (DESIGN.md section 7).
 */
import { useEffect, useRef, useState } from "react";
import { withThousands } from "@/lib/format";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function CountUp({
  value,
  durationMs = 900,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return (
    <span className={className} aria-label={String(value)}>
      {withThousands(String(display))}
    </span>
  );
}
