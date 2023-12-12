CREATE TABLE `details` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date_jst` integer NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`flags` int DEFAULT [object Object] NOT NULL,
	`download_count` integer DEFAULT 0 NOT NULL
);
