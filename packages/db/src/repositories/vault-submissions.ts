import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";

type Db = PostgresJsDatabase<typeof schema>;
export type VaultSubmissionRecord = typeof schema.vaultSubmissions.$inferInsert;

/** Tenant-scoped immutable journal. There is deliberately no update/delete API.
 * The caller must validate the signature, transaction and active authority before
 * insertion. Database constraints serialize intent and grant-sequence conflicts. */
export class VaultSubmissionRepository {
  constructor(private readonly db: Db, private readonly organizationId: string) {}

  async saveOnce(record: Omit<VaultSubmissionRecord, "organizationId" | "createdAt">) {
    await this.db.insert(schema.vaultSubmissions).values({ ...record, organizationId: this.organizationId });
  }

  async load(intentId: string) {
    const [record] = await this.db.select().from(schema.vaultSubmissions).where(and(eq(schema.vaultSubmissions.organizationId, this.organizationId), eq(schema.vaultSubmissions.intentId, intentId))).limit(1);
    return record ?? null;
  }
}
