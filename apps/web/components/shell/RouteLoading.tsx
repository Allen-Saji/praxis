type RouteLoadingVariant = "dashboard" | "list" | "detail";

function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      className={`h-3 rounded-full bg-[var(--border-hi)] ${width}`}
      aria-hidden="true"
    />
  );
}

function SkeletonPanel({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--panel)] p-5"
      aria-hidden="true"
    >
      <div className="mb-5 h-4 w-28 rounded-full bg-[var(--border-hi)]" />
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, index) => (
          <SkeletonLine
            key={index}
            width={index % 2 === 0 ? "w-full" : "w-2/3"}
          />
        ))}
      </div>
    </div>
  );
}

export function RouteLoading({
  label,
  variant,
}: {
  label: string;
  variant: RouteLoadingVariant;
}) {
  const panelCount = variant === "detail" ? 3 : 4;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="mx-auto w-full max-w-[1200px] animate-pulse motion-reduce:animate-none"
    >
      <div className="mb-6 flex items-center gap-3 text-[13px] font-medium text-[var(--text-mid)]">
        <span
          className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]"
          aria-hidden="true"
        />
        {label}
      </div>

      {variant === "dashboard" ? (
        <div className="space-y-5" aria-hidden="true">
          <div className="h-28 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--panel)]" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: panelCount }, (_, index) => (
              <SkeletonPanel key={index} lines={2} />
            ))}
          </div>
          <SkeletonPanel lines={5} />
        </div>
      ) : (
        <div
          className={
            variant === "list"
              ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              : "mx-auto max-w-[960px] space-y-5"
          }
          aria-hidden="true"
        >
          {Array.from({ length: panelCount }, (_, index) => (
            <SkeletonPanel key={index} lines={variant === "detail" ? 4 : 3} />
          ))}
        </div>
      )}
    </div>
  );
}
