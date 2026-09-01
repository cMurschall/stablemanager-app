CREATE TABLE `training_types` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `name` text NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `training_types_tenant_name_uidx` ON `training_types` (`tenant_id`,`name`);
CREATE INDEX `training_types_tenant_idx` ON `training_types` (`tenant_id`);
