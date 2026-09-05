import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "../src/client";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "../src/repositories/auth";
import { databaseUrl, identifier, openAdmin } from "./support";

const test = databaseUrl ? it : it.skip;

describe("hosted runtime RLS", () => {
  test("allows server login while denying browser roles and schema changes", async () => {
    if (!databaseUrl) return;
    const admin = openAdmin(databaseUrl);
    const databaseName = `praxis_rls_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    await admin.unsafe(`CREATE DATABASE ${identifier(databaseName)}`);
    const testUrl = new URL(databaseUrl);
    testUrl.pathname = `/${databaseName}`;
    const { db, client } = createDb(testUrl.toString());
    const setup = await readFile(new URL("../operations/configure-runtime-rls.sql", import.meta.url), "utf8");
    const rollback = new Error("rollback isolated RLS fixture");
    try {
      await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
      await expect(db.transaction(async (tx) => {
        // Roles, policies and fixture rows all disappear with this rollback.
        await tx.execute(sql`CREATE ROLE praxis_app NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`);
        await tx.execute(sql`CREATE ROLE anon NOLOGIN`);
        await tx.execute(sql`CREATE ROLE authenticated NOLOGIN`);
        await tx.execute(sql`GRANT USAGE ON SCHEMA public TO praxis_app, anon, authenticated`);
        await tx.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO praxis_app, anon, authenticated`);
        await tx.execute(sql`ALTER TABLE auth_challenges ENABLE ROW LEVEL SECURITY`);
        const now = new Date();
        const challenge = {
          address: `0x${"a".repeat(64)}`,
          nonceHash: Buffer.alloc(32, 1),
          domain: "praxis.test",
          issuedAt: now,
          expiresAt: new Date(now.getTime() + 60_000),
        };
        // Reproduce the production failure despite valid table grants.
        await expect(tx.transaction(async (inner) => {
          await inner.execute(sql`SET LOCAL ROLE praxis_app`);
          await new AuthRepository(inner).createChallenge(challenge);
        })).rejects.toMatchObject({ cause: { code: "42501" } });

        await expect(tx.transaction(async (inner) => {
          await inner.execute(sql`GRANT praxis_app TO anon`);
          await inner.execute(sql.raw(setup));
        })).rejects.toMatchObject({ cause: { message: "Browser-facing roles must not be members of praxis_app" } });
        await expect(tx.transaction(async (inner) => {
          await inner.execute(sql`ALTER ROLE praxis_app BYPASSRLS`);
          await inner.execute(sql.raw(setup));
        })).rejects.toMatchObject({ cause: { message: "praxis_app must exist as a restricted server role" } });

        await tx.execute(sql.raw(setup));
        await tx.execute(sql.raw(setup)); // Setup is safe to rerun after migrations.
        const policies = await tx.execute(sql`SELECT roles FROM pg_policies WHERE policyname = 'praxis_server_access'`);
        expect(policies).toHaveLength(18);
        expect(policies.every((row) => JSON.stringify(row.roles) === '["praxis_app"]')).toBe(true);

        await tx.execute(sql`SET LOCAL ROLE praxis_app`);
        const auth = new AuthRepository(tx);
        await auth.createChallenge(challenge);
        const tokenHash = Buffer.alloc(32, 2);
        const login = await auth.completeLogin({ address: challenge.address, nonceHash: challenge.nonceHash, sessionTokenHash: tokenHash });
        expect((await auth.activeSession(tokenHash, now))?.user.id).toBe(login.user.id);
        await expect(tx.transaction(async (inner) => {
          await new AuthRepository(inner).completeLogin({ address: challenge.address, nonceHash: challenge.nonceHash, sessionTokenHash: tokenHash });
        })).rejects.toMatchObject({ code: "AUTH_CHALLENGE_UNAVAILABLE" });
        expect(await auth.revokeSession(tokenHash, now)).not.toBeNull();
        expect(await auth.activeSession(tokenHash, now)).toBeNull();
        await expect(tx.transaction(async (inner) => {
          await inner.execute(sql`ALTER TABLE auth_challenges DISABLE ROW LEVEL SECURITY`);
        })).rejects.toMatchObject({ cause: { code: "42501" } });
        await expect(tx.transaction(async (inner) => {
          await inner.execute(sql`UPDATE audit_events SET event_type = 'tampered'`);
        })).rejects.toMatchObject({ cause: { code: "55000" } });
        await tx.execute(sql`RESET ROLE`);

        for (const role of ["anon", "authenticated"]) {
          await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
          expect(await tx.execute(sql`SELECT id FROM users`)).toHaveLength(0);
          expect(await tx.execute(sql`SELECT id FROM sessions`)).toHaveLength(0);
          await expect(tx.transaction(async (inner) => {
            await new AuthRepository(inner).createChallenge({ ...challenge, nonceHash: Buffer.alloc(32, 3) });
          })).rejects.toMatchObject({ cause: { code: "42501" } });
          await tx.execute(sql`RESET ROLE`);
        }
        throw rollback;
      }).catch((error: unknown) => {
        if (error !== rollback) throw error;
      })).resolves.toBeUndefined();
    } finally {
      await client.end();
      // Only this test's isolated database is removed.
      await admin.unsafe(`DROP DATABASE ${identifier(databaseName)} WITH (FORCE)`);
      await admin.end();
    }
  }, 30_000);
});
