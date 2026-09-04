import Link from "next/link";
import { NetworkBadge } from "@/components/shell/NetworkBadge";
import { DEPLOYMENTS } from "@allen-saji/praxis";

export function WorkspaceFrame({ slug, name, eyebrow, title, description, children }: {
  slug: string;
  name: string;
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const base = `/app/workspaces/${slug}`;
  const links = [[base, "Overview"], [`${base}/agents`, "Agents"], [`${base}/decisions`, "Decisions"], [`${base}/settings`, "Settings"]] as const;
  return (
    <div className="min-w-0 space-y-6 pb-24 md:pb-8">
      <header className="space-y-4 border-b border-[var(--divider)] pb-5">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-low)]">
          <Link className="focus-ring rounded px-1 py-2 hover:text-[var(--text-hi)]" href="/app/workspaces">Workspaces</Link>
          <span>/</span><span>{name}</span><NetworkBadge packageId={DEPLOYMENTS.testnet.packageId} />
        </div>
        <div>
          {eyebrow ? <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]">{eyebrow}</p> : null}
          <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--text-hi)] sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-[14px] text-[var(--text-mid)]">{description}</p>
        </div>
        <nav aria-label="Workspace" className="flex min-w-0 gap-1 overflow-x-auto pb-1">
          {links.map(([href, label]) => <Link key={href} href={href} className="focus-ring flex min-h-11 shrink-0 items-center rounded-[var(--r-sm)] px-3 text-[13px] font-medium text-[var(--text-mid)] hover:bg-white/5 hover:text-[var(--text-hi)]">{label}</Link>)}
        </nav>
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
  const color = blocked ? "var(--risk-critical)" : uncertain ? "var(--risk-medium)" : safe ? "var(--risk-low)" : "var(--text-mid)";
  return <span className="inline-flex min-h-7 items-center rounded border border-current/20 bg-white/[0.025] px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color }}>{value.replaceAll("_", " ")}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[var(--r-sm)] border border-dashed border-[var(--border-hi)] px-4 py-8 text-center text-[13px] text-[var(--text-low)]">{children}</div>;
}
