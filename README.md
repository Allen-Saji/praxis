# Praxis

Spending controls, simulation and verifiable evidence for AI agents on Sui.

Praxis lets an owner fund a shared vault and authorize multiple agents with
individual spending limits. Agents request payments through a scoped HTTP
credential. The owner approves the on-chain permissions; a separate delegate
signer executes payments within those permissions. The agent never receives
the owner's wallet key.

[Open app](https://praxis.allensaji.dev/app) |
[Documentation](https://praxis.allensaji.dev/docs) |
[Hosted agent example](examples/hosted-agent.ts)

**Available on Sui Testnet for SUI transfers.**
[Fourth place in the Sui Overflow 2026 Walrus track](https://www.sui.io/blog/sui-overflow-2026-winners).

## What you can build

Give several agents access to one pool of funds while controlling each agent's
recipients, per-payment cap, daily and monthly budgets, total allowance and
expiry. For example, a research agent and an operations agent can share a vault
without sharing an API credential or an individual spending limit.

- **Owner-funded vaults:** deposit only the SUI agents may spend. Change grants,
  revoke delegates, pause the vault or withdraw remaining funds with your wallet.
- **Shared and individual limits:** each payment must satisfy both the vault
  policy and the agent's grant. The Move contract enforces these limits.
- **Preview before execution:** inspect policy violations, budget availability
  and a Sui simulation without signing or reserving funds.
- **Recoverable requests:** stable idempotency keys and a durable signed
  transaction journal support reconciliation without creating another payment.
- **Evidence for each outcome:** inspect workspace activity, public Walrus
  reasoning and immutable Sui receipts for confirmed vault payments.

## Get started with a hosted agent

1. [Open Praxis](https://praxis.allensaji.dev/app), sign in with a Sui wallet and
   create a workspace.
2. Create a spending vault in **Wallets**. Approve its creation in your wallet,
   set the shared limits and deposit Testnet SUI.
3. Add an agent from the vault. Approve its recipients, limits and expiry in your
   wallet. Fund its delegate gas using the labeled 0.05 Testnet SUI top-up, then
   verify and enable hosted access.
4. Issue a credential for the agent's vault assignment. Store the one-time token
   in your agent's secret environment as `PRAXIS_TOKEN`.
5. Check the connection without requesting a payment:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $PRAXIS_TOKEN" \
  https://praxis.allensaji.dev/api/v1/agent
```

The response identifies the authorized agent, assignment and wallet. The API
derives this scope from the credential; agents cannot choose another vault by
sending a wallet ID. Claude Code, Codex and other runtimes can integrate through
a local script or tool. A native MCP connector is not included.

### Preview, submit and track

Save a payment as `payment.json`, replacing the recipient with an approved Sui
address. `amountMist` is an integer string: 1 SUI is 1,000,000,000 MIST.

```json
{
  "recipient": "YOUR_APPROVED_SUI_RECIPIENT",
  "amountMist": "1000000",
  "coinType": "0x2::sui::SUI",
  "privacy": "public",
  "reasoning": {
    "prompt": "Pay the configured service provider",
    "decision": "Send 0.001 SUI within the approved allowance",
    "model": "my-agent"
  }
}
```

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $PRAXIS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @payment.json \
  https://praxis.allensaji.dev/api/v1/simulations
```

Preview returns budgets, policy violations and a simulation report. It never
reserves funds, signs or publishes evidence, and always returns
`executionAuthorized: false`. Policy violations produce an abort recommendation
and skip simulation. A successful preview does not authorize a later payment.

After reviewing the result, submit the same body to `POST /api/v1/spend-intents`
with an `Idempotency-Key` header (8-128 printable ASCII characters). This requests
a real Testnet payment and publishes the supplied reasoning. Use one unique key
per payment and reuse that key with the identical body on every retry. Changed
content with the same key returns HTTP 409.

Track the returned `intentId` through `GET /api/v1/spend-intents/{intentId}` using
the same credential. A confirmed response includes `txDigest`, `receiptId` and
`walrusBlobId`. For pending or `submission_unknown` outcomes, retain the original
request ID and reconcile it; do not create a replacement payment with a new key.

The [complete example](examples/hosted-agent.ts) defaults to preview and requires
explicit Testnet confirmation before execution.

## How a hosted payment works

1. Authenticate the credential and resolve its workspace, agent and vault.
2. Create or load the idempotent intent and resolve the active policy versions.
3. Reserve shared and individual UTC day/month budgets under PostgreSQL locks.
4. Simulate the transfer and evaluate its risk report.
5. Publish the reasoning to Walrus and verify its readback before signing.
6. Have the isolated delegate signer sign the validated vault transaction.
7. Journal the signed transaction before submission. The Move contract checks
   the grant, recipient, limits, expiry and replay sequence atomically with payment.
8. Confirm the receipt and settle the reservation. An uncertain submission keeps
   its reservation until reconciliation resolves the stored transaction digest.

Individual allowances are ceilings, not separately reserved balances. Pending
API requests count against available budgets. Payment limits cover principal;
delegate gas is funded separately and is not part of the vault balance.

## Integration modes

| | Hosted vault API | Direct SDK |
| --- | --- | --- |
| Agent connection | Credential scoped to an agent-vault assignment | Application calls `Praxis` methods |
| Funds | Owner deposits SUI into a shared vault | Funds held by the configured wallet adapter |
| Signing | Separate owner-authorized delegate service | Your application supplies the wallet adapter |
| Authorization | On-chain vault grants plus hosted policy checks | SDK policy checks and your signing controls |
| Evidence | Intent API, workspace activity, vault receipts | Core receipt package and `PraxisReader` |

The legacy configured demo wallet remains available to existing deployments. It
is not the onboarding path for new owner-funded vaults.

### Direct SDK quickstart

```bash
pnpm add @allen-saji/praxis @mysten/sui
```

```ts
import { Praxis, GenericAdapter, makeSuiClient } from "@allen-saji/praxis";

// Supply your signing service; keep its key outside the agent runtime.
const wallet = new GenericAdapter({
  address: async () => signerAddress,
  client: makeSuiClient("testnet"),
  sign: async (bytes) => signer.sign(bytes),
});
const praxis = new Praxis({
  network: "testnet",
  wallet,
  policy: { maxPerTx: 50_000_000n, minRiskScoreToBlock: 80, requireSim: true },
});

const result = await praxis.spend({
  to: recipient,
  amount: 1_000_000n,
  privacy: "public",
  reasoning: { prompt, decision, model: "my-agent" },
  onReport: (report) => report.recommendation === "proceed",
});
```

This path does not create a hosted vault or inherit its on-chain grants. See the
[SDK guide](https://praxis.allensaji.dev/docs#direct-sdk) for adapter configuration,
simulation and receipt reads.

## Current scope and security

- Hosted execution supports **Sui Testnet SUI transfers**. Mainnet, arbitrary
  contract calls and other coins are not enabled.
- Multiple owner-funded vaults and multiple agents per vault are supported.
  Owners approve vault permissions through wallet transactions. API credentials
  are scoped and revocable; revoking a credential is distinct from revoking its
  on-chain delegate grant.
- Workspace views require authorized membership. Sui transactions, receipts and
  published Walrus reasoning are public. Never put secrets in reasoning.
- Hosted execution accepts `privacy: "public"` only. The legacy local encryption
  adapter is not a production Seal key-server integration.
- Simulation is a check of current state, not a guarantee that a transaction
  will succeed. Execution checks current policies and on-chain authorization again.
- Mainnet readiness still requires independent security review, an upgrade
  authority policy, signer recovery and backup procedures, operational alerting,
  and a separately authorized release. Testnet verification is not a security audit.

## Repository

| Path | Purpose |
| --- | --- |
| `move/praxis_vault` | Owner-funded vaults, agent grants, budgets and immutable receipts |
| `move/praxis_core` | Direct SDK receipt, registry and policy package |
| `packages/sdk` | Sui/Walrus services, vault builders, simulation and direct SDK |
| `packages/control-plane` | Policy, money, authentication and intent state machine |
| `packages/db` | PostgreSQL schema, migrations, reservations and signed transaction journal |
| `apps/web` | Owner workspace, vault onboarding and hosted HTTP API |
| `apps/agents` | Sample research, trading and adversarial agents |
| `examples` | Client integration examples |
| `scripts` | Signer service, deployment, reconciliation and guarded acceptance tools |
| `deployments` | Testnet package IDs and recorded contract acceptance evidence |

## Local development

Requires Node.js 20.10 or later, pnpm 10.30.3 and PostgreSQL. CI uses Node.js 22.
Configure a local database and the required variables described in `.env.example`.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:migrate
pnpm --filter @allen-saji/praxis-web dev
```

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm move:test  # Requires the Sui CLI; no live credentials needed.
```

Database tests require a reachable test database. The root lint and typecheck
commands build workspace declarations first. CI also runs PostgreSQL integration
tests, Move tests and a production dependency audit. Its Sui CLI is pinned to the
official Testnet 1.65.1 binary with archive checksum and version verification.

## Deployment and operations

- [Hosted deployment](docs/hosted-deployment.md): web environment, migrations,
  restricted database role, owner authentication and legacy demo operations.
- [Vault signer deployment](docs/testnet-vault-signer.md): isolated Testnet
  signer, persistent key storage, gas funding and recovery requirements.
- [Vault contract](move/praxis_vault/README.md): contract semantics and boundaries.
- [Vault package record](deployments/testnet-vault.json) and
  [contract acceptance record](deployments/testnet-vault-acceptance.json).
  Direct SDK deployment IDs live in `deployments/testnet.json`.

Live acceptance scripts can spend Testnet SUI and publish evidence. Review their
configuration and explicit execution guards before running them. Keep credentials,
keys and local `.praxis` records out of source control. Preserve request IDs and
signed transaction records when reconciling uncertain outcomes.

## License

MIT
