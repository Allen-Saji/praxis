# Isolated Testnet vault signer

This service is a Testnet prototype. Contract and local isolated-key acceptance
passed; public HTTP hosting and browser onboarding still need acceptance.
Mainnet is not supported. The verified chain run is recorded in
`deployments/testnet-vault-acceptance.json`.

The signer runs as a separate process on a server. It provisions one encrypted
Ed25519 key per organization, assignment, package, vault and agent. It accepts
only a single vault spend call matching that scope, with an explicit gas cap.
It cannot call vault owner-management functions through its signing endpoint.
The contract remains the authority for payment limits, recipients and expiry.

## Process configuration

Build workspace packages, then run `pnpm signer:testnet` with:

- `PRAXIS_SIGNER_NETWORK=testnet`
- `PRAXIS_VAULT_PACKAGE_ID`: verified published vault package.
- `PRAXIS_SIGNER_DIRECTORY`: absolute private persistent directory.
- `PRAXIS_SIGNER_MASTER_KEY`: securely generated 32-byte key, base64 encoded.
- `PRAXIS_SIGNER_TOKEN`: independent high-entropy service credential, at least
  32 bytes. This is not an agent API credential.
- `PRAXIS_SIGNER_MAX_GAS_MIST`: explicit positive gas budget ceiling.
- `PRAXIS_SIGNER_PORT`: optional loopback port, default 4317.

Provision secrets through the service manager's protected environment. Never
paste keys into command arguments, logs or repository files. Run under a
restricted OS account. Keep the master key outside the encrypted key directory
and out of the web application's environment. Back up both separately: losing
the master key loses delegate availability. Owners can still revoke old grants
and withdraw through their own wallets.

Keys are AES-256-GCM encrypted with their scope as authenticated data. Files
are published atomically after fsync. Provisioning retries recover the same
key. Temporary encrypted files are retained for operator-controlled cleanup;
include disk usage in operations monitoring. Key files must have mode 0600.
The key store is a Testnet prototype, not a reviewed mainnet custody system.

## Network boundary

The process binds only to 127.0.0.1. For a remote web runtime, configure a TLS
reverse proxy and restrict ingress. The protocol accepts POST `/provision` and
POST `/address` and POST `/sign` with a server-only bearer credential. Request size, connection
count and timeouts are bounded; public ingress additionally needs rate limits.
Do not expose these endpoints to browser JavaScript.

The web runtime uses `PRAXIS_SIGNER_URL` and `PRAXIS_SIGNER_TOKEN`. Production
requires HTTPS, refuses embedded URL credentials and does not follow redirects.
The web runtime must never receive `PRAXIS_SIGNER_MASTER_KEY` or key files.

`/provision` returns only the public delegate address. `/address` reads an existing
delegate without provisioning a key. `/sign` returns only the
transaction signature. The service never broadcasts: the web execution path must
persist the signed bytes and digest in its immutable journal before submission.

## Recovery and limits

Vault principal pays recipients. Delegate gas coins are separate, funded under
an explicit operator budget. Key provisioning does not fund gas or authorize
spending: the owner must approve the delegate on-chain. A compromised delegate
can spend within its on-chain grant and can bypass off-chain simulation checks.
An evidence reference is not proof that the referenced simulation is accurate.

The database migration enables RLS on recovery records. After migration, run the
reviewed runtime role setup as the database owner to grant server-only insert
and read privileges; update/delete remain revoked. Do not run migrations using
the restricted web role. Test cross-tenant denial and restart recovery before
opening this path to users.

## Web execution configuration

Set `PRAXIS_NETWORK=testnet`, `PRAXIS_VAULT_PACKAGE_ID`,
`PRAXIS_VAULT_MAX_GAS_MIST`, `PRAXIS_SIGNER_URL` and `PRAXIS_SIGNER_TOKEN`
on the web server. Keep `PRAXIS_VAULT_EXECUTION_ENABLED` off until signer
operations and onboarding acceptance pass. Owner-approved grant activation
checks the chain clock, delegate identity and gas balance, then mirrors the
on-chain limits into the control plane. Vault policy editing redirects to
wallet-signed controls; ordinary database policy mutations reject vault scopes.

Apply migrations through 0010 before activation. Multiple delegated vaults can
be enabled in a workspace; the one-enabled-wallet restriction applies only to
the legacy demo signer. Signed submissions are persisted before broadcast.
Unknown outcomes hold reservations until read-only receipt reconciliation.
Turning off new execution does not disable reconciliation of existing records.

## Bounded acceptance runner

`pnpm smoke:vault` prints its plan without submitting anything. Execution needs
explicit transfer authorization, a stable run ID, a recipient and the confirmation
environment variable described by `scripts/smoke-vault.ts`. Preserve the private
`.praxis/vault-acceptance/<run-id>` directory and reuse that run ID for recovery.
It contains signatures and encrypted disposable Testnet keys; never commit it.
The runner retains a stale transaction and writes a separate replacement only
when a different confirmed transaction proves its gas reference was consumed.
All other unresolved signed transactions retain their exact bytes.
