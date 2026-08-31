CREATE TYPE "public"."intent_state" AS ENUM('received', 'policy_blocked', 'reserved', 'simulating', 'simulation_blocked', 'evidence_pending', 'evidence_published', 'signing', 'submitted', 'submission_unknown', 'confirmed', 'abort_record_pending', 'blocked', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."network" AS ENUM('testnet');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('draft', 'active', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."reservation_state" AS ENUM('active', 'committed', 'released', 'expired');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"external_ref" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_external_ref_unique" UNIQUE("organization_id","external_ref")
);
--> statement-breakpoint
CREATE TABLE "wallet_agent_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_agent_unique" UNIQUE("wallet_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"event_type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"metadata_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"amount_mist" bigint NOT NULL,
	"state" "reservation_state" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_reservations_intent_id_unique" UNIQUE("intent_id"),
	CONSTRAINT "reservation_amount_check" CHECK ("budget_reservations"."amount_mist" > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "organization_member_role_check" CHECK ("organization_members"."role" in ('owner', 'admin', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"network" "network" DEFAULT 'testnet' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_slug_check" CHECK ("organizations"."slug" ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$')
);
--> statement-breakpoint
CREATE TABLE "policy_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"wallet_id" uuid,
	"assignment_id" uuid,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_scope_subject_check" CHECK (("policy_scopes"."scope_type" = 'wallet' and "policy_scopes"."wallet_id" is not null and "policy_scopes"."assignment_id" is null) or ("policy_scopes"."scope_type" = 'assignment' and "policy_scopes"."assignment_id" is not null and "policy_scopes"."wallet_id" is null))
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "policy_status" DEFAULT 'draft' NOT NULL,
	"max_per_tx_mist" bigint NOT NULL,
	"max_per_day_mist" bigint NOT NULL,
	"max_per_month_mist" bigint NOT NULL,
	"block_risk_score_at" integer NOT NULL,
	"require_simulation" boolean DEFAULT true NOT NULL,
	"canonical_json" jsonb NOT NULL,
	"policy_hash" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "policy_scope_version_unique" UNIQUE("scope_id","version"),
	CONSTRAINT "policy_scope_hash_unique" UNIQUE("scope_id","policy_hash"),
	CONSTRAINT "policy_limits_check" CHECK ("policy_versions"."max_per_tx_mist" > 0 and "policy_versions"."max_per_day_mist" >= "policy_versions"."max_per_tx_mist" and "policy_versions"."max_per_month_mist" >= "policy_versions"."max_per_day_mist"),
	CONSTRAINT "policy_risk_check" CHECK ("policy_versions"."block_risk_score_at" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "spend_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"purpose_tag" text NOT NULL,
	"recipient" text NOT NULL,
	"amount_mist" bigint NOT NULL,
	"coin_type" text NOT NULL,
	"reasoning_json" jsonb NOT NULL,
	"state" "intent_state" DEFAULT 'received' NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"policy_snapshot_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spend_intents_purpose_tag_unique" UNIQUE("purpose_tag"),
	CONSTRAINT "intent_assignment_idempotency_unique" UNIQUE("assignment_id","idempotency_key"),
	CONSTRAINT "intent_amount_check" CHECK ("spend_intents"."amount_mist" > 0 and "spend_intents"."amount_mist" <= 18446744073709551615),
	CONSTRAINT "intent_coin_check" CHECK ("spend_intents"."coin_type" = '0x2::sui::SUI')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_sui_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_primary_sui_address_unique" UNIQUE("primary_sui_address")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sui_address" text NOT NULL,
	"network" "network" DEFAULT 'testnet' NOT NULL,
	"adapter_type" text DEFAULT 'demo_keypair' NOT NULL,
	"adapter_ref" text NOT NULL,
	"execution_status" text DEFAULT 'disabled' NOT NULL,
	"execution_lease_id" uuid,
	"execution_lease_expires_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_network_address_unique" UNIQUE("network","sui_address")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_agent_assignments" ADD CONSTRAINT "wallet_agent_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_agent_assignments" ADD CONSTRAINT "wallet_agent_assignments_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_agent_assignments" ADD CONSTRAINT "wallet_agent_assignments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "budget_reservations_intent_id_spend_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."spend_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "budget_reservations_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_reservations" ADD CONSTRAINT "budget_reservations_assignment_id_wallet_agent_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."wallet_agent_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_scopes" ADD CONSTRAINT "policy_scopes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_scopes" ADD CONSTRAINT "policy_scopes_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_scopes" ADD CONSTRAINT "policy_scopes_assignment_id_wallet_agent_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."wallet_agent_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_scope_id_policy_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."policy_scopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "spend_intents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "spend_intents_assignment_id_wallet_agent_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."wallet_agent_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "spend_intents_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_intents" ADD CONSTRAINT "spend_intents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_org_created_index" ON "audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "intent_org_created_index" ON "spend_intents" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_enabled_wallet_per_org" ON "wallets" USING btree ("organization_id") WHERE "wallets"."execution_status" = 'enabled';