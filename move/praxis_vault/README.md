# Praxis spending vault

Testnet contract for owner-funded SUI spending with delegated execution.
Published package metadata is in `../../deployments/testnet-vault.json`.
Hosted execution requires explicit deployment configuration and acceptance.
This package is not ready for mainnet deposits.

## Authorization

The owner creates a shared vault and deposits SUI. The owner can authorize,
update or revoke agent grants, change vault policy, pause spending and withdraw
to their own address. Every management function checks the transaction sender.
Withdrawal works while paused and requires no Praxis server or delegate.

Each grant binds a stable agent identity to a delegate address. Only that
address can execute the grant. A payment must satisfy both recipient lists,
both per-payment limits, UTC daily/monthly limits and both total allowances. Grants expire using the
Sui Clock. Sequence and policy versions reject replayed or stale requests.
Usage and sequence survive grant updates, revocation and signer rotation.
Creating another grant remains subject to the same vault allowance.

Lifetime allowances do not reset. Separate UTC daily and calendar-month
budgets reset at their respective boundaries. Window limits default to the
lifetime allowance; owners can configure them independently. Gas is paid by the transaction sender separately from vault principal.
The owner address is fixed; owner transfer and key recovery are not supported.

Payments debit the vault, advance counters and emit a `Payment` event and freeze an immutable `Receipt` atomically.
The event distinguishes vault, owner, agent and executor. Evidence bytes are a
reference supplied by the executor, not proof of simulation or blob validity.
A compromised delegate can spend within its on-chain authorization, including
without the hosted policy checks. Revocation applies once ordered on-chain and
cannot undo an earlier transfer.

## Development

Run `pnpm move:build` and `pnpm move:test` from the repository root. Both the
existing receipt package and this package are checked. SDK transaction builders
are exported from `@allen-saji/praxis`; they require explicit package and vault
IDs and neither sign nor submit transactions.

The bounded Testnet acceptance in `../../deployments/testnet-vault-acceptance.json`
verifies two agent payments, immutable receipts, Walrus evidence readback, daily
limit and revocation rejection simulations, and owner withdrawal. The rejection
probes were simulated, not submitted as failing transactions.

Before public use, hosted signer operations, browser onboarding and HTTP recovery
need acceptance. Mainnet additionally requires independent security review and
an explicit upgrade-authority policy.
