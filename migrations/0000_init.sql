CREATE TABLE `exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`equipment` text NOT NULL,
	`rec_sets` integer NOT NULL,
	`rec_reps_min` integer NOT NULL,
	`rec_reps_max` integer NOT NULL,
	`seed_key` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exercise_user_idx` ON `exercise` (`user_id`);--> statement-breakpoint
CREATE TABLE `exercise_muscle` (
	`exercise_id` text NOT NULL,
	`user_id` text NOT NULL,
	`group_key` text NOT NULL,
	`contribution` real NOT NULL,
	PRIMARY KEY(`exercise_id`, `group_key`)
);
--> statement-breakpoint
CREATE INDEX `exercise_muscle_user_idx` ON `exercise_muscle` (`user_id`);--> statement-breakpoint
CREATE TABLE `metric_daily` (
	`user_id` text NOT NULL,
	`metric` text NOT NULL,
	`local_date` text NOT NULL,
	`dimension` text DEFAULT '' NOT NULL,
	`value` real NOT NULL,
	PRIMARY KEY(`user_id`, `metric`, `local_date`, `dimension`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`wake_time` text DEFAULT '07:00' NOT NULL,
	`sleep_time` text DEFAULT '23:00' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_setting` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `workout` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`tz` text NOT NULL,
	`local_date` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workout_user_date_idx` ON `workout` (`user_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `workout_set` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`reps` integer NOT NULL,
	`weight_kg` real,
	`performed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workout_set_workout_idx` ON `workout_set` (`workout_id`);--> statement-breakpoint
CREATE INDEX `workout_set_user_exercise_idx` ON `workout_set` (`user_id`,`exercise_id`,`performed_at`);