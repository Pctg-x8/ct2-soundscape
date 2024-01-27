CREATE TABLE `pendingUploads` (
	`content_id` integer PRIMARY KEY NOT NULL,
	`r2_multipart_key` text NOT NULL,
	`r2_multipart_upload_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `year_index` ON `details` (`year`);