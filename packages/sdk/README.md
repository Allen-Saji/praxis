# @allen-saji/praxis

Security, simulation, and audit layer for AI agent spending on Sui.

**Simulate before you sign, explain after you spend.**

Praxis sits between an AI agent and its wallet. Before every spend it dry-runs
the transaction on Sui, risk-scores the result against a rule engine, and hands
the report back to the agent to confirm or abort. Only on proceed does the
wallet sign. Every decision, including the ones it blocks, is written to Walrus
with a tamper-evident on-chain receipt.

Three parties, clean separation:

- **Agent** decides and holds no keys.
- **Praxis** simulates, risk-scores, and gates.
- **Wallet** signs only what Praxis forwards.

The novel part: the simulation and risk report flow back to the agent *before*
signing, so it can self-correct. No wallet provider or agent framework does this.

## Install

```bash
npm install @allen-saji/praxis @mysten/sui
```

## Quickstart

```typescript
import { Praxis, KeypairAdapter, makeSuiClient } from "@allen-saji/praxis";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const keypair = Ed25519Keypair.fromSecretKey(process.env.KEY!);
const client = makeSuiClient("testnet");
const praxis = new Praxis({
  network: "testnet",
  wallet: new KeypairAdapter(keypair, client),
});

const result = await praxis.spend({
  to: recipient,
  amount: 1_000_000_000n, // 1 SUI, in MIST
  reasoning: { prompt, decision, model },
});

// result.status is "confirmed" or "aborted".
// Confirmed results include txDigest and receiptId; aborted results include abortReason.
```

## The gate

By default Praxis proceeds only when the simulation recommends `proceed`. Pass
`onReport` to inspect the report and decide for yourself:

```typescript
const result = await praxis.spend({
  to: recipient,
  amount: 5_000_000_000n,
  reasoning: { prompt, decision, model },
  onReport: (report) => report.recommendation === "proceed",
});

if (result.status === "aborted") {
  console.log("blocked:", result.abortReason, result.simulationReport);
}
```

A blocked spend never signs or executes a transfer. After evidence publication,
the trusted operator may sign a separate zero-transfer abort record so the block
is counted on-chain. That is the point: an auditor can prove what was stopped,
not just what went through.

## Reading the audit trail

`PraxisReader` is a read-only view over the on-chain `AgentIndex` and the Walrus
reasoning blobs. No wallet required.

```typescript
import { PraxisReader } from "@allen-saji/praxis";

const reader = new PraxisReader({ network: "testnet" });
const stream = await reader.stream(50); // confirmed + aborted, interleaved
```

## Wallet adapters

- `KeypairAdapter` wraps a Sui `Ed25519Keypair` for a trusted Testnet operator
  process. Do not place it in an untrusted agent process.
- `GenericAdapter` adapts any `{ address, signTransaction }` pair, so Praxis is
  wallet-agnostic and never custodies a key itself.

## What runs on Sui

- Sui gRPC transaction simulation and execution, plus GraphQL event/object
  reads. Normal SDK work does not depend on the deprecated JSON-RPC client.
- Walrus for the reasoning and simulation blobs (spends and blocks alike).
- Move objects: `SpendingReceipt`, `AgentIndex`, `SpendingPolicy`.
- The coin transfer, receipt creation, and index update happen atomically in one
  programmable transaction block, so a receipt can never exist without its spend.

## Direct SDK and hosted Phase 1

This package preserves the direct `Praxis.spend()` API while also exposing the
transport-neutral simulation, evidence, execution, and read services used by
the hosted control plane. Execution errors distinguish definite failure from an
ambiguous submission and retain a derived transaction digest when available.
Hosted orchestration uses that digest for reconciliation before it permits a
retry or releases reserved budget.

Phase 1 is Testnet and SUI-only. Hosted requests support public reasoning only
and require verified hosted Walrus publication before signing an allowed spend.
The local Seal-shaped encryption adapter is a direct-demo compatibility path,
not production Seal and not a hosted privacy claim.

Production isolated custody, multi-wallet Move authorization, real Seal access
policy/key servers, authenticated production Walrus publishing, multi-coin, and
mainnet are explicit later gates.

## License

MIT
