import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
export class WorkspaceRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}
  async createOrganization(input: { slug: string; name: string; userId: string }) {
    return this.db.transaction(async (tx) => { const [organization] = await tx.insert(schema.organizations).values({ slug: input.slug, name: input.name }).returning(); if (!organization) throw new Error("organization creation failed"); await tx.insert(schema.organizationMembers).values({ organizationId: organization.id, userId: input.userId, role: "owner" }); return organization; });
  }
  async member(organizationId: string, userId: string) { const [member] = await this.db.select().from(schema.organizationMembers).where(and(eq(schema.organizationMembers.organizationId, organizationId), eq(schema.organizationMembers.userId, userId))).limit(1); return member ?? null; }
}
