CREATE TABLE "policy_recipient_rules" (
	"policy_version_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"effect" text NOT NULL,
	CONSTRAINT "policy_recipient_rules_policy_version_id_recipient_pk" PRIMARY KEY("policy_version_id","recipient"),
	CONSTRAINT "policy_recipient_effect_check" CHECK ("policy_recipient_rules"."effect" in ('allow', 'deny'))
);
--> statement-breakpoint
ALTER TABLE "policy_recipient_rules" ADD CONSTRAINT "policy_recipient_rules_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;