CREATE TABLE `uploadedParts` (
	`content_id` integer PRIMARY KEY NOT NULL,
	`part_number` integer NOT NULL,
	`etag` text NOT NULL
);
