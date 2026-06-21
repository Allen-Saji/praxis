import type { CodeTab } from "@/components/blocks/CodeBlock";

/**
 * Real SDK calls used across the app (hero, docs, empty states). These mirror the
 * actual @allen-saji/praxis surface: new Praxis({ wallet }), praxis.simulate,
 * praxis.spend with onReport, praxis.audit.recent. No invented APIs.
 */

export const HERO_SNIPPET: CodeTab[] = [
  {
    label: "spend.ts",
    language: "typescript",
    code: `const result = await praxis.spend({
  to: recipient,
  amount: 5_000_000_000n,
  reasoning: { prompt, decision, model },
  onReport: (r) => r.recommendation === "proceed",
});

// -> { status: "aborted", abortReason: "high_risk", ... }`,
  },
];

export const INSTALL_SPEND_SNIPPET: CodeTab[] = [
  {
    label: "first-spend.ts",
    language: "typescript",
    code: `import { Praxis } from "@allen-saji/praxis";

const praxis = new Praxis({ wallet });

await praxis.spend({
  to: recipient,
  amount: 1_000_000_000n,
  reasoning: { prompt, decision, model },
});`,
  },
];

export const DOCS_INSTALL: CodeTab[] = [
  {
    label: "pnpm",
    language: "bash",
    code: `pnpm add @allen-saji/praxis @mysten/sui`,
  },
  {
    label: "npm",
    language: "bash",
    code: `npm install @allen-saji/praxis @mysten/sui`,
  },
];

export const DOCS_CONFIGURE: CodeTab[] = [
  {
    label: "configure.ts",
    language: "typescript",
    code: `import { Praxis, GenericAdapter } from "@allen-saji/praxis";

// Bring any wallet. Praxis never sees a private key; it only
// receives a WalletAdapter that signs the transaction it builds.
const wallet = new GenericAdapter({
  address: async () => signerAddress,
  signTransaction: async (tx) => signer.sign(tx),
});

const praxis = new Praxis({ wallet, network: "testnet" });`,
  },
];

export const DOCS_SIMULATE: CodeTab[] = [
  {
    label: "simulate.ts",
    language: "typescript",
    code: `// Dry-run and risk-score without signing.
const report = await praxis.simulate({
  to: recipient,
  amount: 5_000_000_000n,
});

console.log(report.riskScore);        // 0..100
console.log(report.recommendation);   // "proceed" | "review" | "abort"
console.log(report.risks);            // [{ level, code, message }]`,
  },
];

export const DOCS_SPEND: CodeTab[] = [
  {
    label: "spend.ts",
    language: "typescript",
    code: `// Gate the spend on the report. Returning false aborts before signing.
const result = await praxis.spend({
  to: recipient,
  amount: 5_000_000_000n,
  reasoning: { prompt, decision, model },
  privacy: "sealed",
  auditors: [auditorAddress],
  onReport: (r) => r.recommendation === "proceed",
});

if (result.status === "aborted") {
  console.log("blocked:", result.abortReason);
}`,
  },
];

export const DOCS_AUDIT: CodeTab[] = [
  {
    label: "audit.ts",
    language: "typescript",
    code: `// Read the audit trail. No wallet required.
const receipts = await praxis.audit.recent(50);
const stats = await praxis.audit.indexStats();

console.log(stats.totalAborts);  // drains prevented

// Decrypt sealed reasoning as an allowlisted auditor (server-side).
const reasoning = await praxis.audit.reveal(blobId, viewerAddress);`,
  },
];
