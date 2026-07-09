ALTER TABLE "specs" ADD COLUMN "draft_markdown" text;--> statement-breakpoint
ALTER TABLE "specs" ADD COLUMN "draft_saved_at" bigint;--> statement-breakpoint
ALTER TABLE "specs" ADD COLUMN "draft_saved_by" text;--> statement-breakpoint
ALTER TABLE "specs" ADD CONSTRAINT "specs_draft_saved_by_users_id_fk" FOREIGN KEY ("draft_saved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;