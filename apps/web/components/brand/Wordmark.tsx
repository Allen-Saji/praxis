import Image from "next/image";
import mark from "@/app/icon.png";
import { cn } from "@/lib/cn";

/** Shared opaque gate mark and wordmark for marketing and workspace navigation. */
export function Wordmark({
  className,
  monogram = false,
  compactOnMobile = false,
}: {
  className?: string;
  monogram?: boolean;
  compactOnMobile?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label="Praxis"
      style={{ fontFamily: "var(--font-space-grotesk)" }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 font-semibold tracking-[-0.01em] text-[var(--text-hi)] select-none",
        className,
      )}
    >
      <Image src={mark} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[var(--r-sm)]" />
      {!monogram && (
        <span className={compactOnMobile ? "hidden sm:inline" : undefined}>
          Prax<span className="text-[var(--accent)]">i</span>s
        </span>
      )}
    </span>
  );
}
