CREATE TABLE `booking_participants` (
  `booking_id` text NOT NULL,
  `user_id` text NOT NULL,
  FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `booking_participants_booking_user_uidx` ON `booking_participants` (`booking_id`,`user_id`);
CREATE INDEX `booking_participants_user_idx` ON `booking_participants` (`user_id`);
