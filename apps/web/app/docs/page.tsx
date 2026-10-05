import { SiteNav } from "@/components/marketing/SiteNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { CodeBlock } from "@/components/blocks/CodeBlock";
import {
  DOCS_INSTALL,
  DOCS_CONFIGURE,
  DOCS_SIMULATE,
  DOCS_SPEND,
  DOCS_AUDIT,
} from "@/lib/snippets";
import { DEPLOYMENTS } from "@allen-saji/praxis";

export const metadata = {
  title: "Praxis docs - quickstart",
  description: "Install, configure a wallet adapter, gate your first spend. Testnet, SUI only in v1.",
};

const STEPS = [
  { id: "install", label: "Install" },
  { id: "configure", label: "Configure" },
  { id: "simulate", label: "Simulate" },
  { id: "spend", label: "Spend and gate" },
  { id: "audit", label: "Read the audit trail" },
];

export default function DocsPage() {
  const packageId = DEPLOYMENTS.testnet.packageId;
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="mx-auto w-full max-w-[1080px] flex-1 px-5 py-10">
        <section id="hosted-agents" className="mx-auto mb-10 max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6">
          <h2 className="text-2xl font-semibold">Connect an agent to your workspace</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-7 text-[var(--text-mid)]">
            <li>Open Praxis, sign in with a Sui wallet, and create your workspace.</li>
            <li>Create a spending vault on Sui Testnet, approve it in your wallet, then deposit the SUI your agents may spend.</li>
            <li>Open the vault and add agents. Approve each agent's limits and recipients in your wallet, fund its gas with the labeled 0.05 Testnet SUI top-up, then verify and enable hosted access.</li>
            <li>Issue an assignment credential. Store it locally as PRAXIS_TOKEN; it is shown only once.</li>
            <li>Call GET /api/v1/agent with Authorization: Bearer PRAXIS_TOKEN to check access without a payment.</li>
          </ol>
          <p className="mt-4 text-sm leading-7 text-[var(--text-mid)]">Preview with POST /api/v1/simulations to inspect current limits and risk without reserving funds or signing. Execute with POST /api/v1/spend-intents and an Idempotency-Key; current authorization, budgets and simulation are checked again. A preview is never an execution approval. Requests are authorized by the credential's wallet assignment. Claude Code and Codex can call the HTTP API through a local tool or script; a native MCP connector is not included.</p>
          <p className="mt-3 text-sm leading-7 text-[var(--text-mid)]">Hosted vaults support Sui Testnet SUI. You retain control of deposits, withdrawals and agent permissions. Only deposited vault funds are available for agent payments; delegate gas is funded separately. Published reasoning is public.</p>
          <a className="focus-ring mt-4 inline-flex min-h-11 items-center text-sm text-[var(--accent)]" href="/app">Open app</a>
        </section>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[180px_1fr]">
          {/* On this page */}
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-20 flex flex-col gap-1">
              <span className="mb-2 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-low)]">
                On this page
              </span>
              {STEPS.map((step) => (
                <a
                  key={step.id}
                  href={`#${step.id}`}
                  className="inline-flex min-h-11 items-center rounded-[var(--r-sm)] px-2 text-[13px] text-[var(--text-mid)] transition-colors duration-150 hover:bg-white/5 hover:text-[var(--text-hi)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  {step.label}
                </a>
              ))}
            </div>
          </nav>

          {/* Content */}
          <article className="flex max-w-[72ch] flex-col gap-10">
            <header className="flex flex-col gap-2">
              <h1 className="text-gradient text-[34px] font-semibold leading-[40px] tracking-tight">
                Direct SDK quickstart
              </h1>
              <p className="text-[16px] leading-[26px] text-[var(--text-mid)]">
                Install, configure a wallet adapter, gate your first spend. Testnet, SUI only in v1.
              </p>
            </header>

            <Step id="install" n={1} title="Install">
              <p className="text-[16px] leading-[26px] text-[var(--text-mid)]">
                Add the SDK and the Sui client to your project.
              </p>
              <CodeBlock tabs={DOCS_INSTALL} />
            </Step>

            <Step id="configure" n={2} title="Configure">
              <p className="text-[16px] leading-[26px] text-[var(--text-mid)]">
                Direct SDK mode takes a wallet adapter. Keep the signer isolated from the agent. Hosted vault mode uses assignment credentials and a separate delegate signer authorized by the vault owner.
              </p>
              <CodeBlock tabs={DOCS_CONFIGURE} />
            </Step>

            <Step id="simulate" n={3} title="Simulate">
              <p className="text-[16px] leading-[26px] text-[var(--text-mid)]">
                Dry-run a spend and read the risk-scored report without signing anything.
              </p>
              <CodeBlock tabs={DOCS_SIMULATE} />
            </Step>

            <Step id="spend" n={4} title="Spend and gate">
              <p className="text-[16px] leading-[26px] text-[var(--text-mid)]">
                Gate the spend on the report. Returning false from onReport aborts the spend before
                it signs, and the abort is recorded with its reasoning.
              </p>
              <CodeBlock tabs={DOCS_SPEND} />
            </Step>

            <Step id="audit" n={5} title="Read the audit trail">
              <p className="text-[16px] leading-[26px] text-[var(--text-mid)]">
                Read public receipts and counters with no wallet. Hosted reasoning is public. The legacy local encryption adapter is not a production Seal integration.
              </p>
              <CodeBlock tabs={DOCS_AUDIT} />
            </Step>
          </article>
        </div>
      </main>
      <SiteFooter packageId={packageId} />
    </div>
  );
}

function Step({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3">
      <h2 className="flex items-center gap-2.5 text-[20px] font-semibold leading-[26px] text-[var(--text-hi)]">
        <span className="flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] border border-white/10 bg-white/5 font-mono text-[13px] text-[var(--accent)]">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
