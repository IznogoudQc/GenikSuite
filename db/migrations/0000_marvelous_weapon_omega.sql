CREATE TABLE `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` text NOT NULL,
	`comment` text DEFAULT '',
	`path` text DEFAULT '',
	`color` text,
	`is_pinned` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_number_idx` ON `projects` (`number`);--> statement-breakpoint
CREATE TABLE `subfolders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`relative_path` text NOT NULL,
	`position` integer DEFAULT 0,
	`enabled` integer DEFAULT true
);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`project_number` text DEFAULT '',
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`duration_min` integer NOT NULL,
	`comment` text DEFAULT '',
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `time_entries_date_idx` ON `time_entries` (`date`);--> statement-breakpoint
CREATE INDEX `time_entries_project_idx` ON `time_entries` (`project_number`,`date`);