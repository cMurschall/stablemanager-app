CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`timezone` text DEFAULT 'Europe/Berlin' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uidx` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_user_tenant_uidx` ON `memberships` (`user_id`,`tenant_id`);
--> statement-breakpoint
CREATE INDEX `memberships_tenant_idx` ON `memberships` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `login_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_tokens_email_idx` ON `login_tokens` (`email`);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tenant_id` text,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_uidx` ON `sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`name` text,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`invited_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invites_tenant_idx` ON `invites` (`tenant_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_uidx` ON `invites` (`token_hash`);
--> statement-breakpoint
CREATE TABLE `accommodations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`capacity` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accommodations_tenant_idx` ON `accommodations` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `horses` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`feif_id` text,
	`sex` text,
	`birth_year` integer,
	`owner_user_id` text,
	`accommodation_id` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`accommodation_id`) REFERENCES `accommodations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `horses_tenant_idx` ON `horses` (`tenant_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `horses_tenant_feif_uidx` ON `horses` (`tenant_id`,`feif_id`);
--> statement-breakpoint
CREATE INDEX `horses_owner_idx` ON `horses` (`tenant_id`,`owner_user_id`);
--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resources_tenant_idx` ON `resources` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`horse_id` text,
	`notes` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`horse_id`) REFERENCES `horses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bookings_tenant_time_idx` ON `bookings` (`tenant_id`,`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE INDEX `bookings_resource_idx` ON `bookings` (`resource_id`,`starts_at`);
--> statement-breakpoint
CREATE TABLE `bulletin_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`expires_at` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bulletin_posts_tenant_idx` ON `bulletin_posts` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `care_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`horse_id` text NOT NULL,
	`type` text NOT NULL,
	`due_at` text NOT NULL,
	`done_at` text,
	`interval_days` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`horse_id`) REFERENCES `horses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `care_events_tenant_due_idx` ON `care_events` (`tenant_id`,`due_at`);
--> statement-breakpoint
CREATE INDEX `care_events_horse_idx` ON `care_events` (`horse_id`);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`care_event_id` text,
	`read_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`care_event_id`) REFERENCES `care_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`read_at`);
--> statement-breakpoint
CREATE INDEX `notifications_tenant_idx` ON `notifications` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `horse_accommodation_history` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`horse_id` text NOT NULL,
	`accommodation_id` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`changed_by` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`horse_id`) REFERENCES `horses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accommodation_id`) REFERENCES `accommodations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `horse_acc_hist_horse_idx` ON `horse_accommodation_history` (`horse_id`,`started_at`);
--> statement-breakpoint
CREATE INDEX `horse_acc_hist_tenant_idx` ON `horse_accommodation_history` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `horse_acc_hist_open_idx` ON `horse_accommodation_history` (`horse_id`,`ended_at`);
