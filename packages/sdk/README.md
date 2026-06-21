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
import { Praxis, KeypairAdapter } from "@allen-saji/praxis";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const praxis = new Praxis({
  network: "testnet",
  wallet: new KeypairAdapter(Ed25519Keypair.fromSecretKey(process.env.KEY!)),
});

const result = await praxis.spend({
  to: recipient,
  amount: 1_000_000_000n, // 1 SUI, in MIST
  reasoning: { prompt, decision, model },
});

// result.status is "confirmed", "aborted", or "policy_block"
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

A blocked spend never signs and never moves funds, and the block itself is
logged to Walrus and counted on-chain. That is the point: an auditor can prove
what was stopped, not just what went through.

## Reading the audit trail

`PraxisReader` is a read-only view over the on-chain `AgentIndex` and the Walrus
reasoning blobs. No wallet required.

```typescript
import { PraxisReader } from "@allen-saji/praxis";

const reader = new PraxisReader({ network: "testnet" });
const stream = await reader.stream(50); // confirmed + aborted, interleaved
```

## Wallet adapters

- `KeypairAdapter` wraps a Sui `Ed25519Keypair` for server-side agents.
- `GenericAdapter` adapts any `{ address, signTransaction }` pair, so Praxis is
  wallet-agnostic and never custodies a key itself.

## What runs on Sui

- `sui_dryRunTransactionBlock` for pre-flight simulation of every spend.
- Walrus for the reasoning and simulation blobs (spends and blocks alike).
- Move objects: `SpendingReceipt`, `AgentIndex`, `SpendingPolicy`.
- The coin transfer, receipt creation, and index update happen atomically in one
  programmable transaction block, so a receipt can never exist without its spend.

## Scope

v1 is testnet and SUI-denominated. The sealed-reasoning path uses a local
encryption stand-in with the same shapes as Seal; swapping in Seal key servers
is drop-in. Real wallet-provider adapters (Privy, Turnkey), multi-coin, and
mainnet are post-v1.

## License

MIT
