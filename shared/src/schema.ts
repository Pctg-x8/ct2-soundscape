import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const details = sqliteTable(
    "details",
    {
        id: integer("id").primaryKey(),
        title: text("title").notNull(),
        artist: text("artist").notNull(),
        genre: text("genre").notNull(),
        minBPM: integer("min_bpm").notNull(),
        maxBPM: integer("max_bpm").notNull(),
        year: integer("year").notNull(),
        month: integer("month").notNull(),
        day: integer("day").notNull(),
        comment: text("comment").notNull().default(""),
        downloadCount: integer("download_count").notNull().default(0),
        licenseType: integer("license_type").notNull().default(0),
        licenseText: text("license_text"),
    },
    (table) => ({
        yearIndex: index("year_index").on(table.year),
    })
);
export type Details = Readonly<typeof details.$inferSelect>;
export type DetailsInsert = Readonly<typeof details.$inferInsert>;

export const pendingUploads = sqliteTable("pendingUploads", {
    contentId: integer("content_id").primaryKey(),
    r2MultipartKey: text("r2_multipart_key").notNull(),
    r2MultipartUploadId: text("r2_multipart_upload_id").notNull(),
});
