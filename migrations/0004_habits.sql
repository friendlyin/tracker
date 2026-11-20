CREATE TABLE `habit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`target` real,
	`unit` text,
	`focus` text,
	`days` integer NOT NULL,
	`position` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `habit_user_idx` ON `habit` (`user_id`);