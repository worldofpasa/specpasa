ALTER TABLE `specs` ADD `draft_markdown` text;--> statement-breakpoint
ALTER TABLE `specs` ADD `draft_saved_at` integer;--> statement-breakpoint
ALTER TABLE `specs` ADD `draft_saved_by` text REFERENCES users(id);