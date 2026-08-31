CREATE TABLE IF NOT EXISTS `horse_accommodation_history` (
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
CREATE INDEX IF NOT EXISTS `horse_acc_hist_horse_idx` ON `horse_accommodation_history` (`horse_id`,`started_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `horse_acc_hist_tenant_idx` ON `horse_accommodation_history` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `horse_acc_hist_open_idx` ON `horse_accommodation_history` (`horse_id`,`ended_at`);
--> statement-breakpoint
INSERT INTO `horse_accommodation_history` (`id`, `tenant_id`, `horse_id`, `accommodation_id`, `started_at`, `ended_at`, `changed_by`)
SELECT lower(hex(randomblob(16))), `tenant_id`, `id`, `accommodation_id`, COALESCE(`updated_at`, `created_at`), NULL, NULL
FROM `horses`
WHERE `accommodation_id` IS NOT NULL
  AND `id` NOT IN (
    SELECT `horse_id` FROM `horse_accommodation_history` WHERE `ended_at` IS NULL
  );
