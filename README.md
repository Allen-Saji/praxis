# Praxis

Wallet-agnostic security, simulation, and audit layer for AI agent spending on Sui.

Praxis sits between an AI agent and its wallet. The agent never holds a private
key. Before every spend, Praxis simulates the transaction, risk-scores the
result, and hands a report back to the agent to confirm or abort. Only then does
it ask the wallet to sign. Every decision, including aborts, is written to Walrus
with a tamper-evident on-chain receipt.

Built for Sui Overflow 2026 (Walrus track). Testnet, SUI-denominated spends in v1.

## The three-party model

![Praxis architecture](docs/praxis-architecture.png)

The agent decides and holds no keys. Every spend enters the Praxis SDK as
`praxis.spend()`, is dry-run simulated, risk-scored against 7 rules, and gated.
Only on a proceed does the wallet adapter sign. Every decision, confirm and
abort, is persisted on Sui in one atomic PTB across Walrus, Move objects, and
Seal.

The novel part: the simulation and risk report flow back to the agent before
signing, so the agent can self-correct. A prompt-injected agent that tries to
drain the wallet gets stopped, and the blocked attempt is logged as the audit
artifact.

## What is in the box

```
move/praxis_core      Move package: spending_receipt, agent_registry, policy
packages/sdk          @allen-saji/praxis: the spend flow, risk engine, adapters,
                      Walrus + Seal integration, and a read-only PraxisReader
apps/agents           Sample agents: researcher, trader, attacker
apps/web              Next.js dashboard (read-only, decrypt-only)
scripts               Move deploy script
deployments           Recorded testnet package + object ids
```

## How a spend works

`Praxis.spend()` runs: build the transfer, dry-run it with
`sui_dryRunTransactionBlock`, score the result against the built-in rules, return
a report, gate on the recommendation, sign through the wallet adapter, write the
reasoning to Walrus, and emit an on-chain receipt in one programmable
transaction. Aborts skip the signing and transfer but still write the reasoning
and bump the on-chain abort counter.

Risk rules (v1): `DRAIN_DETECTED`, `BLOCKED_RECIPIENT`, `UNKNOWN_RECIPIENT`,
`OVER_TX_LIMIT`, `OVER_DAILY_LIMIT`, `SIM_FAILED`, `HIGH_GAS`. Scores 0 to 100;
review at 30, block at 80.

## SDK quickstart

```ts
import { Praxis, KeypairAdapter } from "@allen-saji/praxis";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" });
const wallet = new KeypairAdapter(keypair, client);

const praxis = new Praxis({
  network: "testnet",
  wallet,
  policy: { maxPerTx: 50_000_000n, minRiskScoreToBlock: 80, requireSim: true },
});

const result = await praxis.spend({
  to: recipient,
  amount: 5_000_000n,
  reasoning: { prompt, decision, model: "claude-opus-4-8" },
  onReport: (report) => report.recommendation === "proceed",
});
// -> { status: "confirmed" | "aborted", receiptId?, walrusBlobId, txDigest?, simulationReport }
```

Read-only consumers (dashboards, auditors) use `PraxisReader`, which needs no
wallet:

```ts
import { PraxisReader } from "@allen-saji/praxis";

const reader = new PraxisReader({ network: "testnet" });
await reader.indexStats();          // { totalCount, totalAborts, abortRate }
await reader.stream(50);            // unified confirmed + aborted feed
await reader.reveal(blobId, viewer); // decrypt sealed reasoning if allowlisted
```

## Develop

```bash
pnpm install
pnpm move:test                       # Move unit tests
pnpm --filter @allen-saji/praxis build      # build the SDK
pnpm --filter @allen-saji/praxis-web dev        # run the dashboard

# Run the sample agents against testnet (operator key from your Sui keystore):
PRAXIS_OPERATOR_KEY=suiprivkey... pnpm --filter @allen-saji/praxis-agents start all
```

Deploy the Move package and record the ids:

```bash
pnpm deploy:move                     # publishes to the active Sui env
```

## Deployment (testnet)

Current ids live in `deployments/testnet.json` and `packages/sdk/src/config.ts`.

## Current scope

v1 is a testnet, SUI-only SDK and read-only dashboard. It ships
`KeypairAdapter` and `GenericAdapter`, seven deterministic risk checks, Sui
receipt and abort records, and Walrus-backed decision evidence. The sealed
reasoning path currently uses a local encryption adapter rather than production
Seal key servers.

The current sample agents use logical agent addresses while one operator wallet
signs for all of them. Their policies are configured in code, daily spend is
tracked in process, and the demo keypair is not isolated from the agent process.
This proves the spend-control flow, but it is not yet a hosted or production
wallet service.

## Future scope

Praxis will evolve from an SDK into a hosted wallet control service for
organizations managing multiple wallets and multiple agents. The planned
product includes:

- **Hosted control plane.** A managed endpoint receives agent payment intents,
  simulates and risk-scores them, applies policy, stores the decision evidence,
  and requests signing from a connected wallet or custody provider only after
  approval.
- **Multiple wallets and isolated agent controls.** An organization can connect
  several treasury or operational wallets, each with its own default limits and
  rules. Each wallet can serve multiple authenticated agents, and wallet-agent
  assignments define exactly which agent may use which wallet. Every agent can
  then have its own transaction, daily, and monthly limits; recipient allowlists
  and blocklists; asset and action rules; and risk threshold. Persistent
  accounting isolates usage by organization, wallet, and agent so one agent
  cannot consume another agent's allowance.
- **Rules configured by conversation.** An operator can tell the Praxis agent,
  "The research agent may spend up to 5 SUI per day on approved data vendors."
  Praxis converts that request into a typed, versioned policy proposal, shows
  the exact change, and activates it only after human review.
- **Operations dashboard.** The existing audit dashboard becomes a workspace
  for organizations, wallets, and agents. Teams can compare activity across
  wallets, inspect each wallet's assigned agents, and view wallet-level and
  agent-level spending, budget usage, recipients, risk distribution, blocked
  attempts, policy history, Sui receipts, and Walrus evidence from one place.
- **Reports and alerts.** Daily and weekly spend summaries show confirmed
  payments and remaining budgets by wallet and agent, plus repeated blocks,
  unusual recipients, and risk trends. Threshold alerts can be delivered
  through email, Slack, or webhooks.
- **Production wallet integrations.** Add isolated signing and provider adapters
  for services such as Privy and Turnkey, authenticated agent identities,
  persistent shared policy state, real Seal encryption, durable Walrus
  publishing, multi-coin support, Sui mainnet deployment, and an external
  security review.

See `docs/SPEC.md` for the full product and technical spec.

## License

MIT
