# Praxis spending vault

Unpublished contract prototype for owner-funded SUI spending with delegated
execution. This package is not connected to the hosted application and is not
ready for mainnet deposits.

## Authorization

The owner creates a shared vault and deposits SUI. The owner can authorize,
update or revoke agent grants, change vault policy, pause spending and withdraw
to their own address. Every management function checks the transaction sender.
Withdrawal works while paused and requires no Praxis server or delegate.

Each grant binds a stable agent identity to a delegate address. Only that
address can execute the grant. A payment must satisfy both recipient lists,
both per-payment limits and both total allowances. Grants expire using the
Sui Clock. Sequence and policy versions reject replayed or stale requests.
Usage and sequence survive grant updates, revocation and signer rotation.
Creating another grant remains subject to the same vault allowance.

Allowances in this prototype are lifetime totals. They do not reset daily or
monthly. Gas is paid by the transaction sender separately from vault principal.
The owner address is fixed; owner transfer and key recovery are not supported.

Payments debit the vault, advance counters and emit a `Payment` event atomically.
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

Before public use, this prototype still needs calendar budget windows, the
final receipt/evidence schema, isolated signing, hosted recovery and ownership
synchronization, wallet onboarding, independent security review, an explicit
upgrade-authority policy, and live network acceptance. No deployment IDs are
provided because this package has not been published.
