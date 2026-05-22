# Praxis

Wallet-agnostic security, simulation, and audit layer for AI agent spending on Sui.

Praxis sits between any AI agent and any wallet provider — the agent never touches private keys. Before every spend, Praxis parses intent, simulates the transaction, risk-scores the result, and feeds a rich report back to the agent. The agent self-corrects or confirms. Only then does Praxis instruct the underlying wallet to sign. Every decision writes a reasoning trail to Walrus.

## Architecture

```
Agent (decides) → Praxis SDK (simulates, validates, gates) → Wallet (signs)
                         ↓
                  Walrus (audit trail) + Sui (onchain receipts) + Seal (privacy)
```

## Stack

- **Sui Move** — SpendingReceipt, AgentIndex, SpendingPolicy
- **Walrus** — reasoning + simulation report blobs
- **Seal** — policy-gated encryption for selective audit reveal
- **Sponsored Tx (Enoki)** — gas-free agent spending
- **zkLogin** — dashboard auth

## Status

Spec complete. Build in progress for Sui Overflow 2026 (Walrus track).

See [docs/SPEC.md](docs/SPEC.md) for the full product + technical spec.
