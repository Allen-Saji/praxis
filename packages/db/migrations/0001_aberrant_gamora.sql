CREATE TABLE "assignment_budget_counters" (
	"assignment_id" uuid NOT NULL,
	"period_kind" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"spent_mist" bigint DEFAULT 0 NOT NULL,
	"reserved_mist" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_budget_counters_assignment_id_period_kind_period_start_pk" PRIMARY KEY("assignment_id","period_kind","period_start"),
	CONSTRAINT "assignment_counter_nonnegative" CHECK ("assignment_budget_counters"."spent_mist" >= 0 and "assignment_budget_counters"."reserved_mist" >= 0 and "assignment_budget_counters"."period_kind" in ('day', 'month'))
);
--> statement-breakpoint
CREATE TABLE "wallet_budget_counters" (
	"wallet_id" uuid NOT NULL,
	"period_kind" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"spent_mist" bigint DEFAULT 0 NOT NULL,
	"reserved_mist" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_budget_counters_wallet_id_period_kind_period_start_pk" PRIMARY KEY("wallet_id","period_kind","period_start"),
	CONSTRAINT "wallet_counter_nonnegative" CHECK ("wallet_budget_counters"."spent_mist" >= 0 and "wallet_budget_counters"."reserved_mist" >= 0 and "wallet_budget_counters"."period_kind" in ('day', 'month'))
);
--> statement-breakpoint
ALTER TABLE "assignment_budget_counters" ADD CONSTRAINT "assignment_budget_counters_assignment_id_wallet_agent_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."wallet_agent_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_budget_counters" ADD CONSTRAINT "wallet_budget_counters_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;