CREATE TABLE "vault_submissions" (
	"intent_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"network" "network" DEFAULT 'testnet' NOT NULL,
	"package_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"agent_address" text NOT NULL,
	"sequence" numeric(20, 0) NOT NULL,
	"digest" text NOT NULL,
	"transaction_bytes" text NOT NULL,
	"signature" text NOT NULL,
	"request_json" jsonb NOT NULL,
	"gas_budget" numeric(20, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_submissions_digest_unique" UNIQUE("digest"),
	CONSTRAINT "vault_submission_sequence_unique" UNIQUE("network","package_id","vault_id","agent_address","sequence"),
	CONSTRAINT "vault_submission_addresses_check" CHECK ("vault_submissions"."package_id" ~ '^0x[0-9a-f]{64}$' and "vault_submissions"."vault_id" ~ '^0x[0-9a-f]{64}$' and "vault_submissions"."agent_address" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "vault_submission_sequence_check" CHECK ("vault_submissions"."sequence" >= 0 and "vault_submissions"."sequence" <= 18446744073709551615),
	CONSTRAINT "vault_submission_gas_check" CHECK ("vault_submissions"."gas_budget" > 0 and "vault_submissions"."gas_budget" <= 18446744073709551615),
	CONSTRAINT "vault_submission_payload_check" CHECK (length("vault_submissions"."transaction_bytes") between 1 and 262144 and length("vault_submissions"."signature") between 1 and 4096 and length("vault_submissions"."digest") between 1 and 128)
);
--> statement-breakpoint
ALTER TABLE "vault_submissions" ADD CONSTRAINT "vault_submission_intent_tenant_fk" FOREIGN KEY ("organization_id","intent_id") REFERENCES "public"."spend_intents"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vault_submissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION reject_vault_submission_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'signed vault submissions are immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER vault_submission_immutable BEFORE UPDATE ON vault_submissions
FOR EACH ROW EXECUTE FUNCTION reject_vault_submission_update();
