CREATE TABLE `notify_due` (
	`user_id` text PRIMARY KEY NOT NULL,
	`due_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notify_due_at_idx` ON `notify_due` (`due_at`);--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_endpoint_unique` ON `push_subscription` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscription_user_idx` ON `push_subscription` (`user_id`);