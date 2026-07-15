CREATE TYPE "public"."decision_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(10) NOT NULL,
	"admin_token" varchar(24) NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" varchar(500),
	"status" "decision_status" DEFAULT 'open' NOT NULL,
	"deadline" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"label" varchar(80) NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"token" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rankings" (
	"participant_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "rankings_participant_id_option_id_pk" PRIMARY KEY("participant_id","option_id"),
	CONSTRAINT "rankings_participant_rank_unique" UNIQUE("participant_id","rank")
);
--> statement-breakpoint
ALTER TABLE "options" ADD CONSTRAINT "options_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_option_id_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "options_decision_id_idx" ON "options" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "participants_decision_id_idx" ON "participants" USING btree ("decision_id");