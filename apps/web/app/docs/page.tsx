import type { ReactNode } from "react";
import { SiteNav } from "@/components/marketing/SiteNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { CodeBlock } from "@/components/blocks/CodeBlock";
import { DOCS_INSTALL, DOCS_CONFIGURE, DOCS_SIMULATE, DOCS_SPEND, DOCS_AUDIT } from "@/lib/snippets";
import { DEPLOYMENTS } from "@allen-saji/praxis";

export const metadata = {
  title: "Praxis docs - vaults, agent payments and SDK",
  description: "Create a spending vault, authorize agents with individual limits, and integrate the Praxis HTTP API or direct SDK on Sui Testnet.",
};

const GROUPS = [
  { title: "Hosted agents", links: [["hosted-agents", "Overview"], ["create-vault", "Set up a vault"], ["connect", "Connect your agent"], ["preview", "Preview a payment"], ["execute", "Submit and track"], ["controls", "Limits and recovery"]] },
  { title: "Direct SDK", links: [["direct-sdk", "Overview"], ["install", "Install"], ["configure", "Configure"], ["simulate", "Simulate"], ["spend", "Spend and gate"], ["audit", "Read receipts"]] },
];
const link = "focus-ring text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-4 hover:decoration-current";
const check = `curl --fail-with-body --silent --show-error \\
  -H "Authorization: Bearer $PRAXIS_TOKEN" \\
  https://praxis.allensaji.dev/api/v1/agent`;
const payload = `{
  "recipient": "YOUR_APPROVED_SUI_RECIPIENT",
  "amountMist": "1000000",
  "coinType": "0x2::sui::SUI",
  "privacy": "public",
  "reasoning": {
    "prompt": "Pay the configured service provider",
    "decision": "Send 0.001 SUI within the approved allowance",
    "model": "my-agent"
  }
}`;
const preview = `curl --fail-with-body --silent --show-error \\
  -H "Authorization: Bearer $PRAXIS_TOKEN" \\
  -H "Content-Type: application/json" \\
  --data-binary @payment.json \\
  https://praxis.allensaji.dev/api/v1/simulations`;
const execute = `# Set a unique ID for this payment. Keep it for every retry.
curl --fail-with-body --silent --show-error \\
  -H "Authorization: Bearer $PRAXIS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $PRAXIS_IDEMPOTENCY_KEY" \\
  --data-binary @payment.json \\
  https://praxis.allensaji.dev/api/v1/spend-intents`;
const track = `# Use the intentId returned by the spend request.
curl --fail-with-body --silent --show-error \\
  -H "Authorization: Bearer $PRAXIS_TOKEN" \\
  "https://praxis.allensaji.dev/api/v1/spend-intents/$INTENT_ID"`;

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="mx-auto grid w-full max-w-[1120px] flex-1 gap-8 px-5 py-8 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-14 lg:py-12">
        <nav aria-label="Documentation sections" className="min-w-0 border-b border-[var(--border)] pb-6 lg:border-0 lg:pb-0">
          <details className="lg:hidden">
            <summary className="focus-ring flex min-h-11 cursor-pointer items-center justify-between text-sm font-medium text-[var(--text-hi)]">On this page <span aria-hidden="true">+</span></summary>
            <div className="grid grid-cols-2 gap-5 pt-4"><NavigationLinks /></div>
          </details>
          <div className="sticky top-24 hidden space-y-8 lg:block"><NavigationLinks /></div>
        </nav>
        <article className="min-w-0 space-y-14 text-base leading-7 text-[var(--text-mid)]">
          <header id="hosted-agents" className="scroll-mt-24 space-y-5">
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--accent)]">Documentation / Sui Testnet</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-[var(--text-hi)] sm:text-5xl">Give your agents a budget.</h1>
            <p className="max-w-[62ch] text-lg leading-8">Create a vault, set each agent&apos;s limits, and connect through the HTTP API. Praxis checks every payment and records the reasoning alongside its outcome.</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <a className={`${link} inline-flex min-h-11 items-center`} href="/app">Open your workspace <span aria-hidden="true" className="ml-2">&rarr;</span></a>
              <a className="focus-ring inline-flex min-h-11 items-center underline underline-offset-4" href="#direct-sdk">Using your own signer? Direct SDK</a>
            </div>
            <dl className="grid gap-5 border-y border-[var(--border)] py-6 sm:grid-cols-3">
              <Fact title="Network">Sui Testnet, SUI payments</Fact>
              <Fact title="Authorization">Owner-approved vault grants</Fact>
              <Fact title="Evidence">Public reasoning on Walrus</Fact>
            </dl>
          </header>

          <Section id="create-vault" eyebrow="01 / Owner setup" title="Create a vault and authorize agents">
            <p>Your sign-in wallet controls the vault. Agents can spend only the SUI you deposit, within the permissions you approve.</p>
            <ol className="divide-y divide-[var(--border)]">
              {[
                ["Create and fund a vault", "Sign in with your Sui wallet and create a workspace. In Wallets, create a spending vault, approve the transaction, then deposit Testnet SUI and set the shared limits."],
                ["Set each agent's permissions", "Add an agent from the vault. Approve its recipients, per-payment limits, daily and monthly budgets, total allowance and expiry in your wallet."],
                ["Fund gas and enable access", "Use the labeled 0.05 Testnet SUI top-up to fund the agent's delegate gas separately. Verify and enable hosted access once the grant and funding are ready."],
              ].map(([title, body], index) => (
                <li key={title} className="flex gap-4 py-5">
                  <span className="mt-1 font-mono text-sm text-[var(--accent)]">0{index + 1}</span>
                  <div><h3 className="font-medium text-[var(--text-hi)]">{title}</h3><p className="mt-1">{body}</p></div>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="connect" eyebrow="02 / Agent setup" title="Issue a credential and check access">
            <p>On the agent page, issue a credential for its vault assignment. Save it in your agent&apos;s secret environment as <code>PRAXIS_TOKEN</code>; the token is shown once. The credential identifies the agent and vault, so requests do not supply those IDs.</p>
            <CodeBlock tabs={[{ label: "Check connection", code: check }]} />
            <p>A successful response identifies the authorized agent, assignment and wallet without making a payment. Claude Code, Codex and other runtimes can call this API through a local tool or script. There is no native MCP connector.</p>
          </Section>

          <Section id="preview" eyebrow="03 / Before spending" title="Preview a payment">
            <p>Save the following as <code>payment.json</code> and replace the recipient with an address approved in your grant. Amounts are integer strings in MIST: 1 SUI = 1,000,000,000 MIST.</p>
            <CodeBlock tabs={[{ label: "payment.json", code: payload }]} />
            <CodeBlock tabs={[{ label: "Preview request", code: preview }]} />
            <p>The response includes current budgets, policy violations and a simulation report. A policy violation returns <code>recommendation: "abort"</code> and skips simulation. Review the result before submitting.</p>
            <Note>Preview does not reserve funds, sign a transaction or publish evidence. It always returns <code>executionAuthorized: false</code>. Execution checks current permissions and budgets again.</Note>
          </Section>

          <Section id="execute" eyebrow="04 / Payment lifecycle" title="Submit once. Track the outcome.">
            <p>After a successful preview, set <code>PRAXIS_IDEMPOTENCY_KEY</code> to a unique request ID (8-128 printable ASCII characters). This call requests a real Testnet payment and publishes the supplied reasoning.</p>
            <CodeBlock tabs={[{ label: "Submit payment", code: execute }, { label: "Track intent", code: track }]} />
            <p>Keep the same key and identical payload for retries, including after a timeout. A different payload with the same key returns HTTP 409. Save the returned <code>intentId</code> to track the outcome.</p>
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Payment states and next actions</caption>
                <thead className="bg-[var(--panel)] text-[var(--text-hi)]"><tr><th scope="col" className="p-4 font-medium">State</th><th scope="col" className="p-4 font-medium">What to do</th></tr></thead>
                <tbody className="divide-y divide-[var(--border)]">
                  <tr><td className="p-4 font-mono">confirmed</td><td className="p-4">Read the transaction digest, receipt and Walrus blob ID.</td></tr>
                  <tr><td className="p-4 font-mono">blocked / failed / expired</td><td className="p-4">Review the outcome in Activity before making a new request.</td></tr>
                  <tr><td className="p-4 font-mono">submission_unknown</td><td className="p-4">Keep the original request ID. Reconciliation must resolve the signed transaction; do not create another payment.</td></tr>
                </tbody>
              </table>
            </div>
            <p>Other states are still processing. Poll the intent endpoint; polling does not submit a payment. For a complete integration, see the <a className={link} href="https://github.com/Allen-Saji/praxis/blob/main/examples/hosted-agent.ts">hosted agent example</a>.</p>
          </Section>

          <Section id="controls" title="Understand the boundaries">
            <dl className="space-y-6">
              <Boundary title="Shared balance, individual limits">Every payment must satisfy both the vault and agent limits. Individual allowances are ceilings, not reserved balances. Daily and monthly windows use UTC. Pending requests count against available API budgets.</Boundary>
              <Boundary title="Owner control">Use your wallet to change grants, revoke delegates, pause the vault or withdraw remaining funds. An API credential is separate from the on-chain grant; revoking that credential stops its API access.</Boundary>
              <Boundary title="Gas and evidence">Payment limits cover principal. Delegate gas is funded separately and is not part of the vault balance. Published reasoning and Sui transactions are public; never include credentials or private data in reasoning.</Boundary>
              <Boundary title="Testnet scope">Hosted vaults support SUI transfers on Sui Testnet. Mainnet, arbitrary contract calls, other coins and hosted private reasoning are not available.</Boundary>
            </dl>
          </Section>

          <section id="direct-sdk" className="scroll-mt-24 border-t border-[var(--border)] pt-12">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--accent)]">Alternative integration</p>
            <h2 className="text-3xl font-semibold tracking-tight text-[var(--text-hi)]">Direct SDK quickstart</h2>
            <p className="mt-4">Use the direct SDK when you operate your own wallet adapter and signing service. This path uses the core receipt package; it does not create a hosted vault or enforce its on-chain grants. Keep the signer isolated from the agent runtime.</p>
          </section>
          <Section id="install" title="Install"><CodeBlock tabs={DOCS_INSTALL} /></Section>
          <Section id="configure" title="Configure your adapter"><p>Connect your signing service through the wallet adapter interface.</p><CodeBlock tabs={DOCS_CONFIGURE} /></Section>
          <Section id="simulate" title="Simulate"><p>Dry-run a transfer and inspect the risk report before signing.</p><CodeBlock tabs={DOCS_SIMULATE} /></Section>
          <Section id="spend" title="Spend and gate"><p>Return false from <code>onReport</code> to abort before signing and record the decision.</p><CodeBlock tabs={DOCS_SPEND} /></Section>
          <Section id="audit" title="Read the audit trail"><p>Read direct SDK receipts and counters without a wallet. For hosted vault payments, use the intent endpoint and your workspace Activity page.</p><CodeBlock tabs={DOCS_AUDIT} /></Section>
        </article>
      </main>
      <SiteFooter packageId={DEPLOYMENTS.testnet.packageId} />
    </div>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-24 space-y-4">{eyebrow && <p className="text-xs font-medium uppercase tracking-widest text-[var(--accent)]">{eyebrow}</p>}<h2 className="text-2xl font-semibold leading-8 tracking-tight text-[var(--text-hi)]">{title}</h2>{children}</section>;
}
function Fact({ title, children }: { title: string; children: ReactNode }) {
  return <div><dt className="text-xs uppercase tracking-wider text-[var(--text-low)]">{title}</dt><dd className="mt-1 text-sm text-[var(--text-hi)]">{children}</dd></div>;
}
function Boundary({ title, children }: { title: string; children: ReactNode }) {
  return <div><dt className="font-medium text-[var(--text-hi)]">{title}</dt><dd className="mt-1">{children}</dd></div>;
}
function Note({ children }: { children: ReactNode }) {
  return <aside className="border-l-2 border-[var(--accent)] bg-[var(--panel)] py-3 pr-4 pl-5 text-sm leading-6">{children}</aside>;
}

function NavigationLinks() {
  return GROUPS.map((group) => (
    <div key={group.title}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-low)]">{group.title}</p>
      <ul>{group.links.map(([id, label]) => (
        <li key={id}><a href={`#${id}`} className="focus-ring flex min-h-11 items-center rounded px-2 text-sm text-[var(--text-mid)] transition-colors hover:bg-white/5 hover:text-[var(--accent)]">{label}</a></li>
      ))}</ul>
    </div>
  ));
}
