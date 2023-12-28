import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import ContentFlags from "./valueObjects/contentFlags";

export const details = sqliteTable("details", {
    id: integer("id").primaryKey(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    genre: text("genre").notNull(),
    minBPM: integer("min_bpm").notNull(),
    maxBPM: integer("max_bpm").notNull(),
    dateJst: integer("date_jst", { mode: "timestamp" }).notNull(),
    comment: text("comment").notNull().default(""),
    flags: ContentFlags.sqlType("flags").notNull().default(ContentFlags.EMPTY),
    downloadCount: integer("download_count").notNull().default(0),
    licenseType: integer("license_type").notNull().default(0),
    licenseText: text("license_text"),
});
export type Details = Readonly<typeof details.$inferSelect>;
export type DetailsInsert = Readonly<typeof details.$inferInsert>;
