ALTER TABLE details ADD `year` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE details ADD `month` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE details ADD `day` integer NOT NULL DEFAULT 0;--> statement-breakpoint

UPDATE details SET
    `year`=cast(strftime("%Y", `date_jst`, "unixepoch") as int),
    `month`=cast(strftime("%m", `date_jst`, "unixepoch") as int),
    `day`=cast(strftime("%d", `date_jst`, "unixepoch") as int);

ALTER TABLE `details` DROP COLUMN `date_jst`;
