import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { DbDomainError } from "../errors";

type Db = PostgresJsDatabase<typeof schema>;
type AuditWriter = Pick<Db, "insert">;

export type AuditMetadata = Record<string, string | number | boolean | null>;

export type AuditEventInput = {
  organizationId: string | null;
  actorType: string;
  actorId?: string | null;
  eventType: string;
  subjectType: string;
  subjectId: string;
  metadataJson: AuditMetadata;
};

// Audit metadata is intentionally a small, stable allowlist. Provider payloads,
// prompts, credentials, headers, and connection strings must never be persisted.
const SAFE_KEYS = new Set([
  "amountMist", "assignmentId", "effectivePolicyHash", "expiresAt", "from",
  "intentId", "policyHash", "reservationId", "scopeId", "scopeType", "state",
  "stateVersion", "to", "txDigest", "version", "walletId",
]);

function validateMetadata(metadata: AuditMetadata): void {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new DbDomainError("AUDIT_METADATA_REJECTED", "audit metadata must be a flat object");
  }
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (!SAFE_KEYS.has(key) || /token|secret|password|header|signature|prompt|database|connection|url/i.test(key)) {
      throw new DbDomainError("AUDIT_METADATA_REJECTED", "audit metadata contains a prohibited field");
    }
    if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new DbDomainError("AUDIT_METADATA_REJECTED", "audit metadata values must be scalar");
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new DbDomainError("AUDIT_METADATA_REJECTED", "audit metadata contains a non-finite number");
    }
    if (typeof value === "string" && value.length > 512) {
      throw new DbDomainError("AUDIT_METADATA_REJECTED", "audit metadata value is too large");
    }
  }
}

export async function appendAuditEvent(tx: AuditWriter, input: AuditEventInput): Promise<void> {
  validateMetadata(input.metadataJson);
  await tx.insert(schema.auditEvents).values({
    organizationId: input.organizationId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    eventType: input.eventType,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    metadataJson: input.metadataJson,
  });
}

export class AuditRepository {
  constructor(private readonly db: Db) {}

  async append(input: AuditEventInput): Promise<void> {
    await appendAuditEvent(this.db, input);
  }
}
