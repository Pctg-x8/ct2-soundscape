import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const details = sqliteTable("details", {
    id: integer("id").primaryKey(),
    title: text("title").notNull(),
    dateJst: integer("date_jst", { mode: "timestamp" }).notNull(),
    comment: text("comment").notNull().default(""),
    downloadCount: integer("download_count").notNull().default(0),
});
export type Details = Readonly<typeof details.$inferSelect>;
export type DetailsInsert = Readonly<typeof details.$inferInsert>;
