ALTER TABLE `users` ADD `password_hash` text;
--> statement-breakpoint
CREATE TABLE `password_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_tokens_token_hash_uidx` ON `password_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `password_tokens_user_idx` ON `password_tokens` (`user_id`);
