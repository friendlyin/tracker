CREATE TABLE `day_type` (
	`user_id` text NOT NULL,
	`local_date` text NOT NULL,
	`type` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `local_date`)
);
--> statement-breakpoint
CREATE TABLE `entry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tracker` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`ended_at` integer,
	`tz` text NOT NULL,
	`local_date` text NOT NULL,
	`value` real,
	`note` text,
	`data` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entry_user_tracker_date_idx` ON `entry` (`user_id`,`tracker`,`local_date`);