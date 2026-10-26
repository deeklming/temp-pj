CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`language` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "posts_language_check" CHECK("posts"."language" IN ('ko-KR', 'en-US', 'ja-JP'))
);
--> statement-breakpoint
CREATE INDEX `posts_created_idx` ON `posts` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `posts_language_idx` ON `posts` (`language`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`nickname` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);