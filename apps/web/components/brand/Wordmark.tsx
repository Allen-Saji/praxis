import { cn } from "@/lib/cn";

/**
 * The Praxis text wordmark: Space Grotesk with a glowing cyan "i" tying it to the
 * brand accent. Replaces the old shield icon. Size is controlled by the caller
 * via className (font-size); weight and tracking are baked in.
 *
 * `monogram` renders a compact "P." (cyan glow dot) for the collapsed mobile nav
 * rail where the full wordmark would not fit.
 */
export function Wordmark({
  className,
  monogram = false,
}: {
  className?: string;
  monogram?: boolean;
}) {
  const accent = "text-[var(--accent)] [text-shadow:0_0_12px_rgba(0,210,255,0.65)]";
  return (
    <span
      style={{ fontFamily: "var(--font-space-grotesk)" }}
      className={cn(
        "font-semibold tracking-[-0.01em] text-[var(--text-hi)] select-none",
        className,
      )}
    >
      {monogram ? (
        <>
          P<span className={accent}>.</span>
        </>
      ) : (
        <>
          Prax<span className={accent}>i</span>s
        </>
      )}
    </span>
  );
}
