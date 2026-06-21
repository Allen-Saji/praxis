---
tags: [project, sui, hackathon, spec]
created: 2026-05-19
modified: 2026-05-25
project: praxis
---

# Praxis — Product + Technical Spec

> Source of truth. Decisions land here. Implementation flows from here. If the build deviates, this doc updates first.

## 1. Executive Summary

Praxis is a wallet-agnostic security, simulation, and audit layer for AI agent spending on Sui. It sits between any AI agent and any wallet provider (Privy, Turnkey, Crossmint, Sui native keypairs) — the agent never touches private keys. Before every spend, Praxis parses intent, simulates the transaction via `sui_dryRunTransactionBlock`, risk-scores the result, and feeds a rich report back to the agent. The agent self-corrects or confirms. Only then does Praxis instruct the underlying wallet to sign. Every decision — including aborts — writes a reasoning trail to Walrus, optionally Seal-encrypted for selective audit reveal.

The product is delivered as: (1) an npm package `@allen-saji/praxis` that any agent framework can drop in, (2) a hosted web dashboard at praxis.dev where developers and compliance officers monitor agent spending, review simulation results, and decrypt sealed reasoning.

**One-line pitch:** "The security middleware between AI agents and their wallets — simulate before you sign, explain after you spend."

## 2. Problem Statement

### 2.1 The security problem

AI agents with private keys are the biggest unsolved attack surface in crypto. A single prompt injection can drain a wallet. Agent frameworks today (ElizaOS, Sendai, AgentKit) either hand the agent a raw private key or use a wallet provider with binary allow/block policies. There is no pre-flight validation layer that:

- Simulates the transaction before signing
- Validates the destination and action match the agent's stated intent
- Risk-scores the outcome (drain detection, unknown programs, slippage)
- Reports findings back to the agent for self-correction
- Logs the full decision chain for audit

The result: agents sign blind. Wallet providers custody keys but don't understand intent. Nobody sits in the middle asking "should this transaction actually happen?"

### 2.2 The regulatory problem

The EU AI Act Article 12 enters enforcement on **2026-08-02** for high-risk AI systems. It requires:

- Records of operation across the lifecycle, retained ≥6 months
- Logs covering: risk situations, post-market monitoring, operational monitoring
- Agent-specific: inputs, outputs, decision points, timestamps, operator interactions
- Multi-step workflows: tool use, intermediate steps, full execution paths

Penalties: up to **€15M or 3% of global turnover**, whichever is higher.

Even agents with wallet providers have no canonical audit trail of *why* they spent. Logs live in the agent framework's local SQLite, the LLM provider's opaque history, the payment rail's transaction ledger, and the developer's CloudWatch — four systems, four formats, no shared trust model.

### 2.3 The trust problem

When the agent has economic agency, the operator's own log is the defendant's own evidence — not credible to auditors, regulators, or counterparties. Onchain receipts + Walrus-stored reasoning + Seal-gated reveal solves this because trust doesn't depend on the operator.

## 3. Demand Validation

| Signal | Magnitude | Source |
|---|---|---|
| Active agents on x402 | ~69,000 | Cryptonews 2026-04-21 |
| Cumulative x402 volume | ~$50M | Cryptonews 2026-04-21 |
| Annualized x402 volume (March) | ~$600M | BlockEden 2026-03-05 |
| Skyfire raise | $9.5M (a16z + CB Ventures) | Tracxn 2026 |
| Coinbase Agentic Wallets launch | 2026-02 | Crossmint comparison |
| EU AI Act Art. 12 enforcement | 2026-08-02 | EU AI Act Service Desk |

Honest counter-signal: Coindesk (2026-03-11) flagged that *real* x402 daily volume is ~$28k and much is test/gamed traffic. This is bullish for Praxis — agents won't move to production spending without a security + audit layer. Praxis is the unlock.

## 4. Target Users (ICPs)

### Primary ICP — Hackathon judging frame

**AI agent framework operators who need their agents to spend safely.** Teams building autonomous trading agents, procurement agents, research agents for enterprises. They can't ship to production without: (a) assurance the agent won't get drained, and (b) an audit trail for compliance.

### Secondary ICPs

- **Wallet providers** (Privy, Turnkey, Crossmint) — Praxis makes their product safer; potential integration partner
- **Compliance officers** evaluating AI agent deployment — the dashboard buyer
- **Insurance underwriters** writing policies on agent-caused loss — need Praxis audit data

### Anti-ICP

- Pure on-chain DeFi bots with hardcoded logic — the reasoning IS the code
- Solo developer hobby agents — no compliance pressure, won't pay

## 5. Core Architecture — Three-Party Model

```
┌──────────────┐     ┌─────────────────────────────┐     ┌──────────────────┐
│   AI Agent   │     │        Praxis SDK            │     │  Wallet Provider │
│ (any runtime)│     │  (security middleware)       │     │ (Privy, Turnkey, │
│              │     │                              │     │  Crossmint, etc) │
│  "Pay $50 to │────▶│  1. Parse intent             │     │                  │
│   addr for   │     │  2. Build tx                 │     │  Holds keys.     │
│   compute"   │     │  3. Simulate (dry-run)       │     │  Signs what's    │
│              │     │  4. Risk-score               │     │  authorized.     │
│              │◀────│  5. Report back to agent     │     │                  │
│              │     │     (rich sim report)        │     │                  │
│  "Confirmed, │────▶│  6. Agent confirms/aborts    │     │                  │
│   proceed"   │     │  7. Forward to wallet ──────▶│─────│  Sign + submit   │
│              │     │  8. Log to Walrus            │     │                  │
└──────────────┘     │  9. Emit onchain receipt     │     └──────────────────┘
                     └─────────────────────────────┘
                                    │
                          ┌─────────┼──────────┐
                          ▼         ▼          ▼
                       Walrus    Sui Move     Seal
                     (reasoning) (receipts)  (privacy)
```

### The Three Parties

| Party | Role | Key material |
|---|---|---|
| **Agent** | Decision maker. States intent, reviews sim report, confirms or aborts | Zero. Never sees a private key. |
| **Praxis** | Intelligence layer. Parses, simulates, risk-scores, reports, logs | Zero. Passes unsigned tx to wallet. |
| **Wallet** | Dumb custodian. Signs what Praxis forwards after agent confirmation | Holds private key. Signs authorized txs. |

### What Makes This Novel

The **rich simulation + risk report flows BACK to the agent** before signing. The agent self-corrects:

- "This would drain 90% of treasury → abort"
- "Slippage exceeds 5% → re-route"
- "Unknown program interaction → refuse"

No existing solution does this. Turnkey has policies but they're binary (allow/block) — the agent never sees *why*. Sendai/ElizaOS just sign blindly. Privy/Crossmint don't simulate at all.

## 6. Goals & Non-Goals

### Goals

- **G1.** Drop-in SDK: any agent can integrate in <10 lines
- **G2.** Pre-flight simulation: every tx is dry-run before signing; agent sees the full report
- **G3.** Wallet-agnostic: works with Privy, Turnkey, Crossmint, raw Sui keypairs, future providers
- **G4.** Verifiable audit trail: every decision (spend + abort) writes reasoning to Walrus, successful spends emit onchain receipts
- **G5.** Selective privacy: Seal-gated reasoning for sensitive flows
- **G6.** Dashboard: search, replay, decrypt agent spending history via zkLogin
- **G7.** Win Sui Overflow 2026 Walrus track ($35k)

### Non-Goals

- **NG1.** Key custody — Praxis never holds keys; that's the wallet provider's job
- **NG2.** Payment rail — we don't move money; we secure and audit the move
- **NG3.** Agent runtime — we don't replace ElizaOS/Sendai; we wrap them
- **NG4.** Multi-chain — Sui-only for hackathon
- **NG5.** ML-based risk scoring — rule-based V1; ML is V2
- **NG6.** Full SOC2 — Praxis produces evidence; we're not the auditor

## 7. Competitive Landscape & Wedge

| Player | What they do | Sim? | Intent? | Report to agent? | Audit trail? |
|---|---|---|---|---|---|
| Turnkey | Policy-gated signing | No | No | No (binary allow/block) | Internal only |
| Privy | Embedded/server wallets | No | No | No | No |
| Crossmint | Agent wallets + cards | No | No | No | No |
| Coinbase AgentKit | Wallet + actions SDK | No | No | No | No |
| Lit Protocol | Threshold signing + conditions | No | No | No | No |
| Sendai / Eliza | Agent frameworks | No | No | No | No |
| Blowfish | Tx simulation for human wallets | Yes | No | Human-only UX | No |
| LangSmith / Langfuse | LLM tracing | No | No | N/A | Off-chain, not payment-aware |
| **Praxis** | **Security middleware** | **Yes** | **Yes** | **Yes (rich report)** | **Walrus + onchain** |

**The wedge:** Every wallet provider handles custody. Every agent framework handles decisions. Nobody handles the question in between: *should this transaction happen?* Praxis is complementary to all of them — not competitive.

## 8. Component Specifications

### 8.1 Move package `praxis::core`

Three modules. Deliberately small (~350 LOC).

#### 8.1.1 `praxis::spending_receipt`

Tamper-evident onchain record of a completed agent spend.

```move
struct SpendingReceipt has key, store {
    id: UID,
    agent: address,
    wallet: address,              // the custodial wallet that signed
    recipient: address,
    amount: u64,
    coin_type: TypeName,
    walrus_blob_id: vector<u8>,   // reasoning + sim report
    seal_policy_id: Option<ID>,
    risk_score: u8,               // 0-100, from pre-flight check
    sim_passed: bool,
    purpose_tag: vector<u8>,      // blake3 hash for replay protection
    timestamp_ms: u64,
    sdk_version: u16,
}
```

Emits `SpendingReceiptCreated` event. Immutable after creation.

#### 8.1.2 `praxis::agent_registry`

Shared object indexing receipts for cheap queries.

```move
struct AgentIndex has key {
    id: UID,
    receipts_by_agent: Table<address, vector<ID>>,
    receipts_by_recipient: Table<address, vector<ID>>,
    receipts_by_day: Table<u32, vector<ID>>,
    total_count: u64,
    total_aborts: u64,
}
```

#### 8.1.3 `praxis::policy`

On-chain spending policies (V1: declarative rules stored as Move objects).

```move
struct SpendingPolicy has key, store {
    id: UID,
    owner: address,
    max_per_tx: u64,
    max_per_day: u64,
    allowed_recipients: vector<address>,   // empty = any
    blocked_recipients: vector<address>,
    min_risk_score_to_block: u8,           // 0 = block nothing, 80 = block high-risk only
    require_sim: bool,                     // always true in V1
}
```

### 8.2 SDK package `@allen-saji/praxis`

#### 8.2.1 Public API

```typescript
class Praxis {
  constructor(opts: {
    network: 'testnet' | 'mainnet';
    wallet: WalletAdapter;               // Privy, Turnkey, Crossmint, or raw keypair
    agentIndex?: string;
    sponsoredTxRelayer?: string;
    walrusPublisher?: string;
    sealKeyServers?: string[];
    policy?: SpendingPolicy;             // optional on-chain or local policy
  });

  // Core flow: intent → simulate → report → confirm → sign → log
  async spend(args: {
    to: string;
    amount: bigint;
    coinType?: string;
    reasoning: {
      prompt: string;
      decision: string;
      model: string;
      metadata?: Record<string, unknown>;
    };
    privacy?: 'public' | 'sealed';
    auditors?: string[];
    autoConfirm?: boolean;              // skip agent review (for low-risk, policy-approved txs)
  }): Promise<SpendResult>;

  // Simulation only — no signing, no logging
  async simulate(args: {
    to: string;
    amount: bigint;
    coinType?: string;
  }): Promise<SimulationReport>;

  // Audit queries
  audit: {
    byAgent(addr: string, opts?: PageOpts): Promise<SpendingReceipt[]>;
    byRecipient(addr: string, opts?: PageOpts): Promise<SpendingReceipt[]>;
    byDateRange(from: Date, to: Date, opts?: PageOpts): Promise<SpendingReceipt[]>;
    reveal(receiptId: string, viewer: SuiKeypair | ZkLoginSession): Promise<ReasoningBlob>;
  };
}

// The rich report that flows back to the agent
type SimulationReport = {
  success: boolean;
  balanceChanges: BalanceChange[];       // what moves, from where, to where
  gasEstimate: bigint;
  riskScore: number;                     // 0-100
  risks: Risk[];                         // human-readable risk flags
  policyViolations: PolicyViolation[];   // which rules would be broken
  recommendation: 'proceed' | 'review' | 'abort';
  rawEffects: TransactionEffects;        // full Sui dry-run response
};

type Risk = {
  level: 'low' | 'medium' | 'high' | 'critical';
  code: string;                          // e.g. 'DRAIN_DETECTED', 'UNKNOWN_PROGRAM', 'HIGH_SLIPPAGE'
  message: string;
};

type SpendResult = {
  status: 'confirmed' | 'aborted';
  receiptId?: string;
  walrusBlobId: string;                  // written for both confirms AND aborts
  txDigest?: string;
  simulationReport: SimulationReport;
};

// Wallet adapter interface — any provider implements this
interface WalletAdapter {
  address(): Promise<string>;
  signTransaction(tx: Transaction): Promise<SignedTransaction>;
}
```

#### 8.2.2 `.spend()` internal flow

1. **Build transaction** — construct PTB for the coin transfer
2. **Simulate** — call `sui_dryRunTransactionBlock`, parse effects
3. **Risk-score** — check balance changes, unknown programs, drain patterns, policy violations
4. **Report to agent** — return `SimulationReport` with recommendation
5. **Agent decision gate:**
   - If `autoConfirm` AND policy passes AND risk < threshold → proceed
   - Else → return report, wait for `.confirm()` call
6. **On confirm** — forward unsigned tx to `WalletAdapter.signTransaction()`
7. **Write reasoning to Walrus** — serialize reasoning + sim report as canonical JSON blob
8. **If sealed** — encrypt blob via Seal with auditor allowlist
9. **Construct receipt PTB** — `SpendingReceipt::emit` + `AgentIndex::register`
10. **Submit** — via sponsored tx (Enoki) or agent's own gas
11. **Return** `SpendResult`

**On abort** (step 5 or agent-initiated):
- Still write reasoning + sim report to Walrus (the abort IS the audit trail)
- Increment `total_aborts` in AgentIndex
- Return `SpendResult` with `status: 'aborted'`

Latency budget: simulate <1s, full flow <4s on testnet.

#### 8.2.3 Built-in risk rules (V1)

| Rule | Code | Trigger |
|---|---|---|
| Balance drain | `DRAIN_DETECTED` | >80% of wallet balance leaves in one tx |
| Unknown recipient | `UNKNOWN_RECIPIENT` | recipient not in policy allowlist (if set) |
| Blocked recipient | `BLOCKED_RECIPIENT` | recipient in policy blocklist |
| Over limit | `OVER_TX_LIMIT` | amount exceeds `max_per_tx` |
| Daily limit | `OVER_DAILY_LIMIT` | cumulative day spend exceeds `max_per_day` |
| Simulation failure | `SIM_FAILED` | dry-run returns error |
| High gas | `HIGH_GAS` | gas estimate >10x typical for this tx type |

### 8.3 Wallet Adapters

```typescript
// Raw Sui keypair (for demos / dev)
class KeypairAdapter implements WalletAdapter { ... }

// Privy server wallet
class PrivyAdapter implements WalletAdapter { ... }

// Turnkey
class TurnkeyAdapter implements WalletAdapter { ... }

// Generic: any provider that exposes signTransaction
class GenericAdapter implements WalletAdapter { ... }
```

V1 ships: `KeypairAdapter` (for hackathon demos) + `GenericAdapter` (escape hatch).
Real wallet provider adapters (Privy, Turnkey) are post-hackathon.

### 8.4 Web app `apps/web` (Next.js + Tailwind)

#### 8.4.1 Pages

| Route | Purpose | Auth |
|---|---|---|
| `/` | Marketing + code demo + "Try the dashboard" | Public |
| `/app` | Dashboard home: agent cards + spending stream + abort rate | zkLogin |
| `/app/agents/:addr` | Agent profile: spending history + sim reports + abort timeline | zkLogin |
| `/app/spend/:id` | Spend detail: reasoning, sim report, risk flags, decrypt button | zkLogin |
| `/docs` | SDK quickstart, wallet adapter guide, architecture | Public |

#### 8.4.2 Key flows

**Dashboard overview:** shows spending volume, abort rate, risk distribution across agents. A high abort rate means the agent is being protected. A low risk-score average means the system is working.

**Decrypt flow:**
1. User clicks sealed spend row
2. Detail page shows blurred reasoning + "Decrypt with Seal" if allowlisted
3. Threshold key fetch → reasoning + sim report render

#### 8.4.3 Visual design

- Dense tables (compliance product, not marketing)
- Dark mode default
- Inter for UI, JetBrains Mono for hashes/code
- Accent: Sui blue (#00d2ff) sparingly

### 8.5 Sample agents (demo content)

Three agents in `apps/agents/`:

1. **Researcher** — pays data APIs. Some requests trigger risk flags (unknown endpoint), demonstrating the sim → report → abort flow. ~12 spends over demo period.
2. **Trader** — pays DEX execution. Higher frequency (~30 spends). Demonstrates daily limit enforcement + drain detection.
3. **Attacker** (synthetic) — deliberately tries to drain the trader's wallet via prompt injection. Praxis catches it. This is the demo money shot.

## 9. Data Model

### 9.1 Walrus reasoning blob schema (V1)

Stored as canonical JSON. Written for BOTH successful spends and aborts.

```json
{
  "v": 2,
  "type": "spend" | "abort",
  "agent": "0x...",
  "wallet": "0x...",
  "ts": 1716120000000,
  "intent": {
    "to": "0x...",
    "amount": 4200000,
    "coin_type": "USDSUI",
    "reasoning": {
      "prompt": "User asked for top 3 DEXes by volume",
      "decision": "Pay $4.20 to data API for live volume data",
      "model": "claude-opus-4-7"
    }
  },
  "simulation": {
    "success": true,
    "balance_changes": [...],
    "gas_estimate": 1200000,
    "risk_score": 15,
    "risks": [],
    "recommendation": "proceed"
  },
  "policy_check": {
    "passed": true,
    "violations": []
  },
  "outcome": "confirmed" | "aborted",
  "abort_reason": null | "agent_decision" | "policy_block" | "high_risk",
  "blake3": "abc123..."
}
```

### 9.2 Seal policy template

```
PolicyType: Allowlist
Allowlist: [<agent_operator>, ...auditors]
```

## 10. Security Model

### 10.1 Threat model

| Threat | Mitigation |
|---|---|
| Prompt injection → wallet drain | Agent never has key; Praxis simulates + risk-scores before forwarding to wallet |
| Malicious agent operator forges reasoning | Reasoning hash committed to receipt at spend time |
| Wallet provider compromise | Out of scope — wallet security is the provider's problem; Praxis adds a layer, doesn't replace theirs |
| Praxis SDK compromise | Open source, auditable; SDK never holds keys; worst case = false approvals (wallet still signs) |
| Sim/execution divergence | Time-bounded: simulate → sign → submit within same PTB; state changes between sim and execution are possible but rare on Sui |
| Sealed reasoning leak via auditor | Out of scope — allowlist is a trust boundary |

### 10.2 What Praxis catches (and doesn't)

**Catches:**
- Balance drains (>80% outflow)
- Unknown/blocked recipients
- Policy violations (limits, allowlists)
- Transaction simulation failures
- Gas estimation anomalies

**Doesn't catch (V1):**
- Sophisticated MEV/sandwich attacks (V2: Sui-specific MEV analysis)
- Semantic intent mismatch ("agent said compute, contract does something else") — V2: program decoder for known Sui programs
- Social engineering of the agent beyond prompt injection

## 11. Sui Stack Integration Map

| Primitive | What Praxis does with it | Why load-bearing |
|---|---|---|
| `sui_dryRunTransactionBlock` | Pre-flight simulation of every spend | Core security mechanism — without this, signing is blind |
| Walrus | Store reasoning + sim reports for both spends and aborts | Verifiable, tamper-evident audit trail that doesn't depend on operator |
| Seal | Policy-gated encryption of sensitive reasoning | Compliance buyers need selective reveal without exposing strategy |
| Sponsored Tx (Enoki) | Gas-free agent spending | Agents shouldn't manage SUI balance; reinforces "agent has no wallet" |
| zkLogin | Dashboard auth via Google/Apple | Compliance officers won't manage crypto wallets |
| Move objects | SpendingReceipt (owned), AgentIndex (shared), SpendingPolicy (owned) | Receipts are composable first-class objects; policies are on-chain enforceable |
| PTBs | Atomic compose: transfer + receipt + index in one tx | Ensures receipt can't exist without the spend, and vice versa |

Seven load-bearing primitives. No vanity imports.

## 12. Hackathon Judging Alignment

| Criterion | Weight | How Praxis scores |
|---|---|---|
| Real-World Application | 50% | EU AI Act Article 12 (Aug 2 2026). Agent wallet security is a documented, active problem. ICP is concrete. |
| Product & UX | 20% | 10-line SDK integration. Sim report as first-class API. Dashboard with abort analytics. Demo: live prompt injection attack → Praxis catches it. |
| Technical Implementation | 20% | Seven Sui primitives meaningfully composed. Three Move modules. Pre-flight simulation pipeline. E2E: agent tries to spend → sim → risk → confirm/abort → Walrus + receipt in <4s. |
| Presentation & Vision | 10% | "Your agent just got prompt-injected. Here's what happened... nothing, because Praxis caught it." Regulatory tailwind. Multi-chain roadmap. |

## 13. Success Metrics

### 13.1 Hackathon must-haves

- M1: SDK published to npm under `@allen-saji/praxis` (testnet)
- M2: Move package deployed to Sui testnet
- M3: Dashboard live at praxis.dev (or vercel fallback)
- M4: ≥50 demo spends across 3 agents including aborted ones
- M5: Live demo of prompt injection → drain attempt → Praxis blocks it
- M6: Sealed + public reasoning both demonstrable
- M7: ≤5 min demo video
- M8: Submission leads with security angle, not "AI agents on Sui"

### 13.2 Post-hackathon

- P1: Mainnet deployment (unlocks 50% prize)
- P2: One real wallet provider adapter (Privy or Turnkey)
- P3: Program decoder for top 10 Sui programs (intent verification, not just sim)
- P4: MCP server distribution (Claude/Cursor users get safe spending in one install)

## 14. Open Questions

- **OQ1:** Sui dry-run latency on testnet — need p50/p99 measurement. Budget is <1s.
- **OQ2:** Does Enoki support sponsored txs for ed25519 signers? If not, agents need zkLogin identity.
- **OQ3:** Seal testnet threshold-decrypt failure rate — need measurement.
- **OQ4:** Walrus blob size limits for large reasoning + sim report payloads.
- **OQ5:** Can we compose dry-run + actual tx in a single PTB, or must they be separate calls?

## 15. Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-19 | Walrus track over Agentic Web | Less crowded, $35k > $30k, Walrus is load-bearing |
| 2026-05-19 | Testnet-only at submission | No real money; 50/50 prize split supports this |
| 2026-05-25 | Pivot from passive audit to active security layer | AgentGuard thesis — pre-flight sim + wallet-agnostic middleware is a stronger product. Audit trail becomes a feature, not the whole product |
| 2026-05-25 | Three-party architecture (agent / praxis / wallet) | Agent never holds keys. Praxis never holds keys. Clean separation of concerns |
| 2026-05-25 | Log aborts to Walrus, not just spends | Aborts ARE the security story — "we stopped 3 drains" is the dashboard headline |
| 2026-05-25 | Attacker sample agent for demo | Live prompt injection → caught by Praxis is the demo money shot |
| 2026-05-25 | V1 ships KeypairAdapter + GenericAdapter only | Real wallet provider adapters (Privy, Turnkey) are post-hackathon scope |

## 16. Related Documents

- [[IMPLEMENTATION]] — Sprint plan (needs update for new architecture)
- [[RESEARCH]] — Sources, demand data, competitive notes
- [[README]] — Quick index
