-- Backfill protections that may have been added to 0004 after it was already
-- applied in a database. Every operation is idempotent for fresh databases.
CREATE OR REPLACE FUNCTION "valid_reasoning_keys"(payload jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(payload) = 'object' AND NOT EXISTS (
    SELECT 1 FROM jsonb_object_keys(payload) AS reasoning_key(name)
    WHERE name NOT IN ('prompt', 'decision', 'model', 'metadata')
  );
$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.spend_intents'::regclass
      AND conname = 'intent_reasoning_keys_check'
  ) THEN
    ALTER TABLE "spend_intents"
      ADD CONSTRAINT "intent_reasoning_keys_check"
      CHECK ("valid_reasoning_keys"("spend_intents"."reasoning_json"));
  END IF;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_audit_sensitive_metadata"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF jsonb_typeof(NEW.metadata_json) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(NEW.metadata_json) AS metadata_key(name)
    WHERE name NOT IN ('amountMist', 'assignmentId', 'effectivePolicyHash', 'expiresAt', 'from', 'intentId', 'policyHash', 'reservationId', 'scopeId', 'scopeType', 'state', 'stateVersion', 'to', 'txDigest', 'version', 'walletId')
  ) OR EXISTS (
    SELECT 1 FROM jsonb_each(NEW.metadata_json) AS metadata_value(name, value)
    WHERE jsonb_typeof(value) NOT IN ('string', 'number', 'boolean', 'null')
  ) THEN
    RAISE EXCEPTION 'audit metadata contains a prohibited field' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_events_metadata_safe" ON "audit_events";--> statement-breakpoint
CREATE TRIGGER "audit_events_metadata_safe" BEFORE INSERT ON "audit_events" FOR EACH ROW EXECUTE FUNCTION "reject_audit_sensitive_metadata"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_cross_tenant_policy_snapshot"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.wallet_policy_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "policy_versions" pv
    INNER JOIN "policy_scopes" ps ON ps.id = pv.scope_id
    WHERE pv.id = NEW.wallet_policy_version_id
      AND ps.organization_id = NEW.organization_id
      AND ps.scope_type = 'wallet'
      AND ps.wallet_id = NEW.wallet_id
  ) THEN
    RAISE EXCEPTION 'wallet policy snapshot is outside the intent tenant or wallet' USING ERRCODE = '23514';
  END IF;
  IF NEW.assignment_policy_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "policy_versions" pv
    INNER JOIN "policy_scopes" ps ON ps.id = pv.scope_id
    WHERE pv.id = NEW.assignment_policy_version_id
      AND ps.organization_id = NEW.organization_id
      AND ps.scope_type = 'assignment'
      AND ps.assignment_id = NEW.assignment_id
  ) THEN
    RAISE EXCEPTION 'assignment policy snapshot is outside the intent tenant or assignment' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "spend_intent_policy_tenant_guard" ON "spend_intents";--> statement-breakpoint
CREATE TRIGGER "spend_intent_policy_tenant_guard" BEFORE INSERT OR UPDATE ON "spend_intents" FOR EACH ROW EXECUTE FUNCTION "reject_cross_tenant_policy_snapshot"();
