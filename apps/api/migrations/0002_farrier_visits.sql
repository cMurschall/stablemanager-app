CREATE TABLE `farrier_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`farrier_name` text,
	`notes` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `farrier_visits_tenant_idx` ON `farrier_visits` (`tenant_id`,`starts_at`);
--> statement-breakpoint
CREATE INDEX `farrier_visits_status_idx` ON `farrier_visits` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE TABLE `farrier_signups` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`horse_id` text NOT NULL,
	`shoeing` text NOT NULL,
	`shoeing_notes` text,
	`presentation` text NOT NULL,
	`presented_at` text,
	`presented_by` text,
	`billed_at` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visit_id`) REFERENCES `farrier_visits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`horse_id`) REFERENCES `horses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`presented_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `farrier_signups_visit_horse_uidx` ON `farrier_signups` (`visit_id`,`horse_id`);
--> statement-breakpoint
CREATE INDEX `farrier_signups_tenant_idx` ON `farrier_signups` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `farrier_signups_visit_idx` ON `farrier_signups` (`visit_id`);
--> statement-breakpoint
CREATE INDEX `farrier_signups_present_idx` ON `farrier_signups` (`tenant_id`,`presented_at`);
