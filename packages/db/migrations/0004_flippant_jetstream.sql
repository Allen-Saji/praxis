CREATE TABLE "wallet_execution_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"intent_id" uuid NOT NULL,
	"worker_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "wallet_lease_identity_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "wallet_lease_worker_check" CHECK (length(btrim("wallet_execution_leases"."worker_id")) between 1 and 128),
	CONSTRAINT "wallet_lease_expiry_check" CHECK ("wallet_execution_leases"."expires_at" > "wallet_execution_leases"."acquired_at")
);
--> statement-breakpoint
ALTER TABLE "budget_reservations" DROP CONSTRAINT "reservation_amount_check";--> statement-breakpoint
ALTER TABLE "policy_versions" DROP CONSTRAINT "policy_limits_check";--> statement-breakpoint
DROP INDEX "intent_org_created_index";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "agent_credentials" WHERE "token_hash" !~ '^[0-9a-fA-F]{64}$')
    OR EXISTS (SELECT 1 FROM "auth_challenges" WHERE "nonce_hash" !~ '^[0-9a-fA-F]{64}$')
    OR EXISTS (SELECT 1 FROM "sessions" WHERE "token_hash" !~ '^[0-9a-fA-F]{64}$') THEN
    RAISE EXCEPTION 'cannot migrate non-canonical persisted authentication digests; rotate them explicitly first' USING ERRCODE = '22P02';
  END IF;
END;
$$;--> statement-breakpoint
ALTER TABLE "agent_credentials" ALTER COLUMN "token_hash" SET DATA TYPE bytea USING decode("token_hash", 'hex');--> statement-breakpoint
ALTER TABLE "assignment_budget_counters" ALTER COLUMN "spent_mist" SET DATA TYPE numeric(20, 0);--> statement-breakpoint
ALTER TABLE "assignment_budget_counters" ALTER COLUMN "spent_mist" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "assignment_budget_counters" ALTER COLUMN "reserved_mist" SET DATA TYPE numeric(20, 0);--> statement-breakpoint
ALTER TABLE "assignment_budget_counters" ALTER COLUMN "reserved_mist" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "nonce_hash" SET DATA TYPE bytea USING decode("nonce_hash", 'hex');--> statement-breakpoint
ALTER TABLE "budget_reservations" ALTER COLUMN "amount_mist" SET DATA TYPE numeric(20, 0);--> statement-breakpoint
ALTER TABLE "policy_versions" ALTER COLUMN "max_per_tx_mist" SET DATA TYPE numeric(20, 0);--> statement-breakpoint
ALTER TABLE "policy_versions" ALTER COLUMN "max_per_day_mist" SET DATA TYPE numeric(20, 0);--> statement-breakpoint
ALTER TABLE "policy_versions" ALTER COLUMN "max_per_month_mist" SET DATA TYPE numeric(20, 0);--> statement-breakpoint
ALTER TABLE "policy_versions" ALTER COLUMN "block_risk_score_at" SET DATA TYPE smallint;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "token_hash" SET DATA TYPE bytea USING decode("token_hash", 'hex');--> statement-breakpoint
ALTER TABLE "spend_intents" ALTER COLUMN "amount_mist" SET DATA TYPE numeric(20, 0);--> statement-breakpoint
ALTER TABLE "wallet_budget_counters" ALTER COLUMN "spent_mist" SET DATA TYPE numeric(20, 0);--> statement-breakpoint
ALTER TABLE "wallet_budget_counters" ALTER COLUMN "spent_mist" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "wallet_budget_counters" ALTER COLUMN "reserved_mist" SET DATA TYPE numeric(20, 0);--> statement-breakpoint
ALTER TABLE "wallet_budget_counters" ALTER COLUMN "reserved_mist" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD COLUMN "organization_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "credential_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "privacy" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "received_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "wallet_policy_version_id" uuid;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "wallet_policy_hash" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "assignment_policy_version_id" uuid;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "assignment_policy_hash" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "effective_policy_hash" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "processing_lease_id" uuid;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "processing_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "simulation_json" jsonb;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "simulation_hash" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "risk_score" smallint;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "recommendation" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "simulated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "evidence_state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "evidence_blob_id" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "evidence_hash" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "evidence_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "evidence_last_error" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "tx_digest" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "receipt_id" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "chain_error_code" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "abort_reason" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "failure_detail" text;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "credential_organization_identity_unique" UNIQUE("organization_id","id","assignment_id");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agent_organization_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "wallet_agent_assignments" ADD CONSTRAINT "assignment_organization_identity_unique" UNIQUE("organization_id","id","wallet_id","agent_id");--> statement-breakpoint
ALTER TABLE "wallet_agent_assignments" ADD CONSTRAINT "assignment_organization_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "reservation_organization_identity_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "policy_scopes" ADD CONSTRAINT "policy_scope_identity_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "policy_scopes" ADD CONSTRAINT "wallet_policy_scope_unique" UNIQUE("organization_id","scope_type","wallet_id");--> statement-breakpoint
ALTER TABLE "policy_scopes" ADD CONSTRAINT "assignment_policy_scope_unique" UNIQUE("organization_id","scope_type","assignment_id");--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_version_scope_identity_unique" UNIQUE("scope_id","id");--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "spend_intent_organization_identity_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "spend_intent_reservation_identity_unique" UNIQUE("organization_id","id","wallet_id","assignment_id");--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "spend_intent_lease_identity_unique" UNIQUE("organization_id","id","wallet_id");--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_organization_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "wallet_execution_leases" ADD CONSTRAINT "wallet_execution_leases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_execution_leases" ADD CONSTRAINT "wallet_execution_leases_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_execution_leases" ADD CONSTRAINT "wallet_execution_leases_intent_id_spend_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."spend_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_execution_leases" ADD CONSTRAINT "wallet_execution_lease_wallet_tenant_fk" FOREIGN KEY ("organization_id","wallet_id") REFERENCES "public"."wallets"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_execution_leases" ADD CONSTRAINT "wallet_execution_lease_intent_tenant_fk" FOREIGN KEY ("organization_id","intent_id","wallet_id") REFERENCES "public"."spend_intents"("organization_id","id","wallet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "credential_assignment_tenant_fk" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "public"."wallet_agent_assignments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_agent_assignments" ADD CONSTRAINT "assignment_wallet_tenant_fk" FOREIGN KEY ("organization_id","wallet_id") REFERENCES "public"."wallets"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_agent_assignments" ADD CONSTRAINT "assignment_agent_tenant_fk" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "budget_reservations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "reservation_intent_identity_fk" FOREIGN KEY ("organization_id","intent_id","wallet_id","assignment_id") REFERENCES "public"."spend_intents"("organization_id","id","wallet_id","assignment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_scopes" ADD CONSTRAINT "policy_scope_wallet_tenant_fk" FOREIGN KEY ("organization_id","wallet_id") REFERENCES "public"."wallets"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_scopes" ADD CONSTRAINT "policy_scope_assignment_tenant_fk" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "public"."wallet_agent_assignments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "spend_intents_credential_id_agent_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."agent_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "spend_intents_wallet_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("wallet_policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "spend_intents_assignment_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("assignment_policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_assignment_identity_fk" FOREIGN KEY ("organization_id","assignment_id","wallet_id","agent_id") REFERENCES "public"."wallet_agent_assignments"("organization_id","id","wallet_id","agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_credential_identity_fk" FOREIGN KEY ("organization_id","credential_id","assignment_id") REFERENCES "public"."agent_credentials"("organization_id","id","assignment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "credential_name_check" CHECK (length(btrim("agent_credentials"."name")) between 1 and 64);--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "credential_token_hash_check" CHECK (octet_length("agent_credentials"."token_hash") = 32);--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agent_name_check" CHECK (length(btrim("agents"."name")) between 1 and 64);--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agent_status_check" CHECK ("agents"."status" in ('active', 'disabled', 'archived'));--> statement-breakpoint
ALTER TABLE "wallet_agent_assignments" ADD CONSTRAINT "assignment_status_check" CHECK ("wallet_agent_assignments"."status" in ('active', 'disabled', 'archived'));--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenge_address_check" CHECK ("auth_challenges"."address" ~ '^0x[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenge_nonce_hash_check" CHECK (octet_length("auth_challenges"."nonce_hash") = 32);--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "reservation_expiry_check" CHECK ("budget_reservations"."expires_at" >= "budget_reservations"."created_at");--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "reservation_amount_check" CHECK ("budget_reservations"."amount_mist" > 0 and "budget_reservations"."amount_mist" <= 18446744073709551615);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_name_check" CHECK (length(btrim("organizations"."name")) between 1 and 80);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_status_check" CHECK ("organizations"."status" in ('active', 'archived'));--> statement-breakpoint
ALTER TABLE "policy_recipient_rules" ADD CONSTRAINT "policy_recipient_address_check" CHECK ("policy_recipient_rules"."recipient" ~ '^0x[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "policy_scopes" ADD CONSTRAINT "policy_scope_type_check" CHECK ("policy_scopes"."scope_type" in ('wallet', 'assignment'));--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_version_number_check" CHECK ("policy_versions"."version" > 0);--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_simulation_required_check" CHECK ("policy_versions"."require_simulation" = true);--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_hash_check" CHECK ("policy_versions"."policy_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_limits_check" CHECK ("policy_versions"."max_per_tx_mist" > 0 and "policy_versions"."max_per_day_mist" >= "policy_versions"."max_per_tx_mist" and "policy_versions"."max_per_month_mist" >= "policy_versions"."max_per_day_mist" and "policy_versions"."max_per_month_mist" <= 99999999999999999999);--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "session_token_hash_check" CHECK (octet_length("sessions"."token_hash") = 32);--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "session_expiry_check" CHECK ("sessions"."expires_at" > "sessions"."created_at");--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_idempotency_key_check" CHECK (length("spend_intents"."idempotency_key") between 8 and 128 and "spend_intents"."idempotency_key" !~ '[^ -~]');--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_request_hash_check" CHECK ("spend_intents"."request_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_purpose_tag_check" CHECK ("spend_intents"."purpose_tag" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_recipient_check" CHECK ("spend_intents"."recipient" ~ '^0x[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_privacy_check" CHECK ("spend_intents"."privacy" = 'public');--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_state_version_check" CHECK ("spend_intents"."state_version" >= 0 and "spend_intents"."attempt_count" >= 0 and "spend_intents"."evidence_attempts" >= 0);--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_reasoning_size_check" CHECK (octet_length(convert_to("spend_intents"."reasoning_json"::text, 'UTF8')) < 16384);--> statement-breakpoint
CREATE OR REPLACE FUNCTION "valid_reasoning_keys"(payload jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(payload) = 'object' AND NOT EXISTS (
    SELECT 1 FROM jsonb_object_keys(payload) AS reasoning_key(name)
    WHERE name NOT IN ('prompt', 'decision', 'model', 'metadata')
  );
$$;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_reasoning_keys_check" CHECK ("valid_reasoning_keys"("spend_intents"."reasoning_json"));--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_simulation_size_check" CHECK ("spend_intents"."simulation_json" is null or octet_length(convert_to("spend_intents"."simulation_json"::text, 'UTF8')) < 65536);--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_hash_pair_check" CHECK (("spend_intents"."wallet_policy_version_id" is null and "spend_intents"."wallet_policy_hash" is null and "spend_intents"."assignment_policy_version_id" is null and "spend_intents"."assignment_policy_hash" is null and "spend_intents"."effective_policy_hash" is null) or ("spend_intents"."wallet_policy_version_id" is not null and "spend_intents"."wallet_policy_hash" is not null and "spend_intents"."assignment_policy_version_id" is not null and "spend_intents"."assignment_policy_hash" is not null and "spend_intents"."effective_policy_hash" is not null));--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_hash_format_check" CHECK (("spend_intents"."wallet_policy_hash" is null or "spend_intents"."wallet_policy_hash" ~ '^[0-9a-f]{64}$') and ("spend_intents"."assignment_policy_hash" is null or "spend_intents"."assignment_policy_hash" ~ '^[0-9a-f]{64}$') and ("spend_intents"."effective_policy_hash" is null or "spend_intents"."effective_policy_hash" ~ '^[0-9a-f]{64}$') and ("spend_intents"."simulation_hash" is null or "spend_intents"."simulation_hash" ~ '^[0-9a-f]{64}$') and ("spend_intents"."evidence_hash" is null or "spend_intents"."evidence_hash" ~ '^[0-9a-f]{64}$'));--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_policy_snapshot_state_check" CHECK (("spend_intents"."state" = 'received' and "spend_intents"."policy_snapshot_json" is null and "spend_intents"."wallet_policy_version_id" is null and "spend_intents"."wallet_policy_hash" is null and "spend_intents"."assignment_policy_version_id" is null and "spend_intents"."assignment_policy_hash" is null and "spend_intents"."effective_policy_hash" is null) or ("spend_intents"."state" in ('failed', 'expired') and (("spend_intents"."policy_snapshot_json" is null and "spend_intents"."wallet_policy_version_id" is null and "spend_intents"."assignment_policy_version_id" is null) or ("spend_intents"."policy_snapshot_json" is not null and "spend_intents"."wallet_policy_version_id" is not null and "spend_intents"."assignment_policy_version_id" is not null))) or ("spend_intents"."state" not in ('received', 'failed', 'expired') and "spend_intents"."policy_snapshot_json" is not null and "spend_intents"."wallet_policy_version_id" is not null and "spend_intents"."assignment_policy_version_id" is not null));--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_processing_lease_pair_check" CHECK (("spend_intents"."processing_lease_id" is null and "spend_intents"."processing_lease_expires_at" is null) or ("spend_intents"."processing_lease_id" is not null and "spend_intents"."processing_lease_expires_at" is not null));--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_evidence_state_check" CHECK ("spend_intents"."evidence_state" in ('pending', 'published', 'failed'));--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_outcome_check" CHECK ("spend_intents"."outcome" is null or "spend_intents"."outcome" in ('confirmed', 'blocked', 'failed'));--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "intent_state_outcome_check" CHECK (("spend_intents"."state" in ('received', 'policy_blocked', 'reserved', 'simulating', 'simulation_blocked', 'evidence_pending', 'evidence_published', 'signing', 'submitted', 'submission_unknown', 'abort_record_pending') and "spend_intents"."outcome" is null) or ("spend_intents"."state" in ('blocked', 'confirmed', 'failed') and "spend_intents"."outcome" is not null) or ("spend_intents"."state" = 'expired' and "spend_intents"."outcome" is null));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_sui_address_check" CHECK ("users"."primary_sui_address" ~ '^0x[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_address_check" CHECK ("wallets"."sui_address" ~ '^0x[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_label_check" CHECK (length(btrim("wallets"."label")) between 1 and 64);--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_adapter_type_check" CHECK ("wallets"."adapter_type" = 'demo_keypair');--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_execution_status_check" CHECK ("wallets"."execution_status" in ('disabled', 'enabled', 'suspended'));--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_lease_pair_check" CHECK (("wallets"."execution_lease_id" is null and "wallets"."execution_lease_expires_at" is null) or ("wallets"."execution_lease_id" is not null and "wallets"."execution_lease_expires_at" is not null));
--> statement-breakpoint
CREATE INDEX "intent_org_created_index" ON "spend_intents" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_one_active_lease" ON "wallet_execution_leases" USING btree ("wallet_id") WHERE "released_at" IS NULL;--> statement-breakpoint
ALTER TABLE "policy_scopes" ADD CONSTRAINT "policy_scope_current_version_fk" FOREIGN KEY ("id","current_version_id") REFERENCES "public"."policy_versions"("scope_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_active_policy_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('active', 'superseded') AND (
    NEW.scope_id IS DISTINCT FROM OLD.scope_id OR NEW.version IS DISTINCT FROM OLD.version OR
    NEW.max_per_tx_mist IS DISTINCT FROM OLD.max_per_tx_mist OR NEW.max_per_day_mist IS DISTINCT FROM OLD.max_per_day_mist OR
    NEW.max_per_month_mist IS DISTINCT FROM OLD.max_per_month_mist OR NEW.block_risk_score_at IS DISTINCT FROM OLD.block_risk_score_at OR
    NEW.require_simulation IS DISTINCT FROM OLD.require_simulation OR NEW.canonical_json IS DISTINCT FROM OLD.canonical_json OR
    NEW.policy_hash IS DISTINCT FROM OLD.policy_hash OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'active or superseded policy content is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'active' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'an active policy cannot return to draft' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'a superseded policy cannot be reactivated' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "policy_versions_content_immutable" BEFORE UPDATE ON "policy_versions" FOR EACH ROW EXECUTE FUNCTION "reject_active_policy_mutation"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_active_recipient_rule_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status policy_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO current_status FROM "policy_versions" WHERE id = OLD.policy_version_id;
  ELSE
    SELECT status INTO current_status FROM "policy_versions" WHERE id = NEW.policy_version_id;
  END IF;
  IF current_status IN ('active', 'superseded') THEN
    RAISE EXCEPTION 'recipient rules for active or superseded policies are immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "policy_recipient_rules_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "policy_recipient_rules" FOR EACH ROW EXECUTE FUNCTION "reject_active_recipient_rule_mutation"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_audit_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only_update" BEFORE UPDATE OR DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION "reject_audit_mutation"();--> statement-breakpoint
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
CREATE TRIGGER "spend_intent_policy_tenant_guard" BEFORE INSERT OR UPDATE ON "spend_intents" FOR EACH ROW EXECUTE FUNCTION "reject_cross_tenant_policy_snapshot"();--> statement-breakpoint
