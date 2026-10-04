# Isolated Testnet vault signer

This service is under development. Hosted vault payment orchestration and live
acceptance are not complete. Do not configure the public application to accept
funds on the basis of this document alone. Mainnet is not supported.

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
POST `/sign` with a server-only bearer credential. Request size, connection
count and timeouts are bounded; public ingress additionally needs rate limits.
Do not expose either endpoint to browser JavaScript.

The web runtime uses `PRAXIS_SIGNER_URL` and `PRAXIS_SIGNER_TOKEN`. Production
requires HTTPS, refuses embedded URL credentials and does not follow redirects.
The web runtime must never receive `PRAXIS_SIGNER_MASTER_KEY` or key files.

`/provision` returns only the public delegate address. `/sign` returns only the
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
