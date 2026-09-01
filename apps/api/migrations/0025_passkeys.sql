CREATE TABLE `user_passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports_json` text,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`aaguid` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_passkeys_credential_id_unique` ON `user_passkeys` (`credential_id`);
--> statement-breakpoint
CREATE INDEX `user_passkeys_user_idx` ON `user_passkeys` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `admin_passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports_json` text,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`aaguid` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`admin_id`) REFERENCES `admin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_passkeys_credential_id_unique` ON `admin_passkeys` (`credential_id`);
--> statement-breakpoint
CREATE INDEX `admin_passkeys_admin_idx` ON `admin_passkeys` (`admin_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `passkey_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`ceremony` text NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text,
	`name` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `passkey_challenges_expires_idx` ON `passkey_challenges` (`expires_at`);
