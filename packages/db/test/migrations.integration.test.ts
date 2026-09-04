import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../src/client";
import { databaseUrl, identifier, openAdmin } from "./support";

const test = databaseUrl ? it : it.skip;
let migrationDatabase: string | undefined;

afterAll(async () => {
  if (!databaseUrl || !migrationDatabase) return;
  const admin = openAdmin(databaseUrl);
  try {
    // The database is created by this test and contains no user data.
    await admin.unsafe(`DROP DATABASE ${identifier(migrationDatabase)} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
});

describe("PostgreSQL migrations", () => {
  test("migrates a fresh database from zero and detects a rerun", async () => {
    if (!databaseUrl) return;
    const admin = openAdmin(databaseUrl);
    migrationDatabase = `praxis_migration_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    await admin.unsafe(`CREATE DATABASE ${identifier(migrationDatabase)}`);
    await admin.end();

    const databaseUrlForTest = new URL(databaseUrl);
    databaseUrlForTest.pathname = `/${migrationDatabase}`;
    const first = createDb(databaseUrlForTest.toString());
    await migrate(first.db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
    const firstRows = await first.client`SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id`;
    const journal = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../migrations/meta/_journal.json", import.meta.url), "utf8")) as { entries: unknown[] };
    expect(firstRows).toHaveLength(journal.entries.length);
    expect(await first.client`SELECT to_regclass('public.organizations') AS name`).toEqual([{ name: "organizations" }]);
    await first.client.end();

    const second = createDb(databaseUrlForTest.toString());
    await migrate(second.db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
    const secondRows = await second.client`SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id`;
    expect(secondRows).toEqual(firstRows);
    expect(await second.client`SELECT count(*)::int AS count FROM pg_class WHERE relname = 'organizations'`).toEqual([{ count: 1 }]);
    // Simulate a database that applied 0004 before the late protections were
    // added to that migration. Removing only the temporary 0005 journal row
    // lets the real migrator exercise the additive upgrade path.
    await second.client`DROP TRIGGER IF EXISTS spend_intent_policy_tenant_guard ON spend_intents`;
    await second.client`DROP TRIGGER IF EXISTS audit_events_metadata_safe ON audit_events`;
    await second.client`CREATE OR REPLACE FUNCTION reject_audit_sensitive_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF jsonb_typeof(NEW.metadata_json) <> 'object' OR EXISTS (
          SELECT 1 FROM jsonb_object_keys(NEW.metadata_json) AS metadata_key(name)
          WHERE name NOT IN ('amountMist', 'assignmentId', 'effectivePolicyHash', 'expiresAt', 'from', 'intentId', 'policyHash', 'reservationId', 'scopeId', 'scopeType', 'state', 'stateVersion', 'to', 'txDigest', 'version', 'walletId')
        ) THEN
          RAISE EXCEPTION 'audit metadata contains a prohibited field' USING ERRCODE = '22023';
        END IF;
        RETURN NEW;
      END;
    $$`;
    await second.client`ALTER TABLE spend_intents DROP CONSTRAINT IF EXISTS intent_reasoning_keys_check`;
    await second.client`DELETE FROM drizzle.__drizzle_migrations WHERE id = ${firstRows.at(-1)?.id}`;
    await migrate(second.db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
    const upgradedRows = await second.client`SELECT id FROM drizzle.__drizzle_migrations ORDER BY id`;
    expect(upgradedRows).toHaveLength(journal.entries.length);
    expect(await second.client`SELECT DISTINCT trigger_name FROM information_schema.triggers WHERE trigger_name IN ('audit_events_metadata_safe', 'spend_intent_policy_tenant_guard') ORDER BY trigger_name`).toEqual([
      { trigger_name: "audit_events_metadata_safe" },
      { trigger_name: "spend_intent_policy_tenant_guard" },
    ]);
    const [organization] = await second.client`INSERT INTO organizations (slug, name) VALUES (${`upgrade-${crypto.randomUUID().slice(0, 12)}`}, 'Migration upgrade') RETURNING id`;
    await expect(second.client`INSERT INTO audit_events (organization_id, actor_type, event_type, subject_type, subject_id, metadata_json) VALUES (${organization!.id}, 'test', 'upgrade_nested', 'migration', ${organization!.id}, ${JSON.stringify({ state: { token: "secret" } })}::jsonb)`).rejects.toMatchObject({ code: "22023" });
    await expect(second.client`WITH
      org_a AS (INSERT INTO organizations (slug, name) VALUES ('upgrade-tenant-a', 'Upgrade tenant A') RETURNING id),
      org_b AS (INSERT INTO organizations (slug, name) VALUES ('upgrade-tenant-b', 'Upgrade tenant B') RETURNING id),
      user_a AS (INSERT INTO users (primary_sui_address) VALUES ('0x1111111111111111111111111111111111111111111111111111111111111111') RETURNING id),
      user_b AS (INSERT INTO users (primary_sui_address) VALUES ('0x2222222222222222222222222222222222222222222222222222222222222222') RETURNING id),
      wallet_a AS (INSERT INTO wallets (organization_id, label, sui_address, adapter_ref) SELECT id, 'Upgrade wallet A', '0x3333333333333333333333333333333333333333333333333333333333333333', 'test:a' FROM org_a RETURNING id, organization_id),
      wallet_b AS (INSERT INTO wallets (organization_id, label, sui_address, adapter_ref) SELECT id, 'Upgrade wallet B', '0x4444444444444444444444444444444444444444444444444444444444444444', 'test:b' FROM org_b RETURNING id, organization_id),
      agent_a AS (INSERT INTO agents (organization_id, name, external_ref) SELECT id, 'Upgrade agent A', 'upgrade-agent-a' FROM org_a RETURNING id, organization_id),
      agent_b AS (INSERT INTO agents (organization_id, name, external_ref) SELECT id, 'Upgrade agent B', 'upgrade-agent-b' FROM org_b RETURNING id, organization_id),
      assignment_a AS (INSERT INTO wallet_agent_assignments (organization_id, wallet_id, agent_id) SELECT wallet_a.organization_id, wallet_a.id, agent_a.id FROM wallet_a JOIN agent_a USING (organization_id) RETURNING id, organization_id, wallet_id, agent_id),
      credential_a AS (INSERT INTO agent_credentials (organization_id, assignment_id, name, token_prefix, token_hash, created_by_user_id) SELECT assignment_a.organization_id, assignment_a.id, 'Upgrade credential A', 'upgrade-token-a', decode(repeat('a', 64), 'hex'), user_a.id FROM assignment_a CROSS JOIN user_a RETURNING id, organization_id, assignment_id),
      scope_a AS (INSERT INTO policy_scopes (organization_id, scope_type, wallet_id) SELECT wallet_a.organization_id, 'wallet', wallet_a.id FROM wallet_a RETURNING id, organization_id),
      scope_b AS (INSERT INTO policy_scopes (organization_id, scope_type, wallet_id) SELECT wallet_b.organization_id, 'wallet', wallet_b.id FROM wallet_b RETURNING id, organization_id),
      policy_a AS (INSERT INTO policy_versions (scope_id, version, status, max_per_tx_mist, max_per_day_mist, max_per_month_mist, block_risk_score_at, require_simulation, canonical_json, policy_hash, created_by_user_id) SELECT scope_a.id, 1, 'active', 1, 1, 1, 90, true, '{}'::jsonb, repeat('a', 64), user_a.id FROM scope_a CROSS JOIN user_a RETURNING id),
      policy_b AS (INSERT INTO policy_versions (scope_id, version, status, max_per_tx_mist, max_per_day_mist, max_per_month_mist, block_risk_score_at, require_simulation, canonical_json, policy_hash, created_by_user_id) SELECT scope_b.id, 1, 'active', 1, 1, 1, 90, true, '{}'::jsonb, repeat('b', 64), user_b.id FROM scope_b CROSS JOIN user_b RETURNING id)
      INSERT INTO spend_intents (organization_id, assignment_id, wallet_id, agent_id, credential_id, idempotency_key, request_hash, purpose_tag, recipient, amount_mist, coin_type, reasoning_json, privacy, wallet_policy_version_id, wallet_policy_hash, assignment_policy_version_id, assignment_policy_hash, effective_policy_hash, state, policy_snapshot_json)
      SELECT assignment_a.organization_id, assignment_a.id, assignment_a.wallet_id, assignment_a.agent_id, credential_a.id, 'upgrade-intent-a', repeat('c', 64), repeat('d', 64), '0x5555555555555555555555555555555555555555555555555555555555555555', 1, '0x2::sui::SUI', '{}'::jsonb, 'public', policy_b.id, repeat('b', 64), policy_a.id, repeat('a', 64), repeat('e', 64), 'reserved', '{}'::jsonb
      FROM assignment_a JOIN credential_a ON credential_a.organization_id = assignment_a.organization_id AND credential_a.assignment_id = assignment_a.id CROSS JOIN policy_a CROSS JOIN policy_b`).rejects.toMatchObject({ code: "23514" });
    await second.client.end();
  });
});
