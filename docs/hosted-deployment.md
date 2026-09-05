# Hosted deployment

The Next.js server connects directly to PostgreSQL. Browsers use Praxis HTTP
APIs and wallet-message authentication, not Supabase Auth or the Supabase Data
API. The server checks organization membership and credential scope; the
trusted database role can access application rows across organizations.

## Production configuration

Set these variables in the hosting provider's Production environment:

- `APP_ORIGIN`: the canonical HTTPS origin, for example
  `https://praxis.allensaji.dev`. Do not include a path. Production sign-in
  fails closed when this is missing; request headers cannot supply a fallback.
- `DATABASE_URL`: the restricted server role's connection string. Use the
  transaction pooler when required by the provider. Keep it server-only.
- `PRAXIS_SESSION_PEPPER` and `PRAXIS_CREDENTIAL_PEPPER`: independent secrets.

Redeploy after changing environment variables. Preview deployments need their
own explicit configuration and should use an isolated database.

## Database rollout

1. Apply all committed migrations using a separate database owner connection:
   `pnpm db:migrate`. Never give the web runtime schema ownership or migration
   privileges. Compare `drizzle.__drizzle_migrations` with the migration journal.
2. Provision the dedicated `praxis_app` server role without superuser,
   `BYPASSRLS`, role creation, or database creation privileges. Grant schema
   usage and the application tables' required SELECT/INSERT/UPDATE/DELETE
   privileges, including newly migrated tables. Keep credentials in the host's
   secret store. Do not grant this role to browser-facing roles.
3. As the table owner, run
   `packages/db/operations/configure-runtime-rls.sql`. It enables RLS and adds
   an explicit server-only policy to each listed application table. Existing
   table grants, constraints, triggers, and unrelated policies are unchanged.
   It does not grant database privileges or create credentials. This is a
   deployment operation, separate from portable schema migrations because the
   server role is provisioned by the operator.
4. Verify every listed table has RLS enabled and the `praxis_server_access`
   policy targets only `praxis_app`. Review any other policies separately;
   this script does not remove policies installed by other tooling.
5. Deploy the application, then verify a wallet-message challenge, signature
   verification, authenticated session, nonce replay rejection, cross-origin
   rejection, and logout. Signing a personal message requires no transfer.

Supabase can enable RLS automatically on new tables. SQL table grants alone do
not satisfy RLS: without an applicable policy, inserts are rejected and reads
return no rows. Do not fix this by disabling RLS, granting `BYPASSRLS`, or
creating an allow-all policy for `PUBLIC`, `anon`, or `authenticated`.

Update the explicit table list when adding application tables, then rerun the
setup after migrations. `pnpm test:db` includes a restricted-role regression
that reproduces the missing-policy failure, exercises login/session/logout,
and verifies browser-role denial even when those roles have table grants.
Run these integration tests only against a disposable local or CI database.

References: [PostgreSQL policies](https://www.postgresql.org/docs/current/sql-createpolicy.html)
and [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).


## Personal application routes

`/app` and `/app/agents` resolve to an authorized workspace. Public address and
receipt lookups under `/app/agents/[addr]` and `/app/spend/[id]` are retired.
The old `/api/stats`, `/api/stream` and `/api/decrypt` endpoints return 410.
Personal evidence requests use `/api/reasoning?organizationId=...&intentId=...`:
the server checks membership and resolves the blob from the owned intent,
ignoring caller-supplied blob IDs. Responses are private and not cached.
The standalone SDK's public Sui/Walrus reads remain available.

No database migration is required for this UI and query update. Rebuild the
workspace packages before deploying the application.
