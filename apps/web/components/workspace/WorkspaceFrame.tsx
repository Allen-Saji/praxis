export function WorkspaceFrame({ title, description, children }: {
  slug: string;
  name: string;
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-6 pb-24 md:pb-8">
      <header className="border-b border-[var(--divider)] pb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-mid)]">{description}</p> : null}
      </header>
      {children}
    </div>
  );
}

export function Panel({ title, detail, children, className = "" }: { title: string; detail?: string; children: React.ReactNode; className?: string }) {
  return <section className={`evidence-surface min-w-0 rounded-[var(--r-md)] p-4 sm:p-5 ${className}`}>
    <div className="mb-4"><h2 className="font-display text-[16px] font-semibold text-[var(--text-hi)]">{title}</h2>{detail ? <p className="mt-1 text-[12px] text-[var(--text-low)]">{detail}</p> : null}</div>
    {children}
  </section>;
}

export function StatePill({ value }: { value: string }) {
  const safe = value === "active" || value === "enabled" || value === "confirmed" || value === "published";
  const blocked = value.includes("blocked");
  const uncertain = value === "submission_unknown" || value.includes("pending");
  const color = blocked ? "var(--risk-low)" : uncertain ? "var(--risk-medium)" : safe ? "var(--risk-low)" : "var(--text-mid)";
  return <span className="inline-flex min-h-7 items-center rounded border border-current/20 bg-white/[0.025] px-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color }}>{value.replaceAll("_", " ")}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[var(--r-sm)] border border-dashed border-[var(--border-hi)] px-4 py-8 text-center text-[13px] text-[var(--text-low)]">{children}</div>;
}
