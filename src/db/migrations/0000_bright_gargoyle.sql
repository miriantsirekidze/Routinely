CREATE TABLE `days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`finished_at` integer,
	`exported` integer DEFAULT false
);
--> statement-breakpoint
CREATE UNIQUE INDEX `days_date_unique` ON `days` (`date`);--> statement-breakpoint
CREATE TABLE `pauses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sub_activity_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_ms` integer DEFAULT 0,
	`reason` text,
	FOREIGN KEY (`sub_activity_id`) REFERENCES `sub_activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`expected_duration` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day_id` integer NOT NULL,
	`template_id` integer,
	`name` text NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`expected_duration` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`day_id`) REFERENCES `days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `session_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `streaks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`current_streak` integer DEFAULT 0,
	`longest_streak` integer DEFAULT 0,
	`last_active_date` text
);
--> statement-breakpoint
CREATE TABLE `sub_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`elapsed_ms` integer DEFAULT 0,
	`expected_duration` integer,
	`note` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sub_activity_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`expected_duration` integer,
	`rest_duration` integer DEFAULT 30,
	FOREIGN KEY (`template_id`) REFERENCES `session_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `weekly_schedule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day_of_week` integer NOT NULL,
	`template_id` integer NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `session_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
