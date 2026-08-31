import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
type IntentState = (typeof schema.intentState.enumValues)[number];

export type NewIntent = {
  organizationId: string; assignmentId: string; walletId: string; agentId: string;
  idempotencyKey: string; requestHash: string; purposeTag: string; recipient: string;
  amountMist: bigint; reasoningJson: Record<string, unknown>;
};

export class IntentRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  async createOrLoad(input: NewIntent) {
    const [created] = await this.db.insert(schema.spendIntents).values({ ...input, coinType: "0x2::sui::SUI" }).onConflictDoNothing().returning();
    if (created) return { kind: "created" as const, intent: created };
    const [existing] = await this.db.select().from(schema.spendIntents).where(and(eq(schema.spendIntents.assignmentId, input.assignmentId), eq(schema.spendIntents.idempotencyKey, input.idempotencyKey))).limit(1);
    if (!existing) throw new Error("idempotency conflict without stored intent");
    if (existing.requestHash !== input.requestHash) return { kind: "conflict" as const, intent: existing };
    return { kind: "existing" as const, intent: existing };
  }

  async transition(id: string, expectedState: IntentState, expectedVersion: number, nextState: IntentState) {
    const [updated] = await this.db.update(schema.spendIntents).set({ state: nextState, stateVersion: expectedVersion + 1, updatedAt: new Date() }).where(and(eq(schema.spendIntents.id, id), eq(schema.spendIntents.state, expectedState), eq(schema.spendIntents.stateVersion, expectedVersion))).returning();
    return updated ?? null;
  }
}
