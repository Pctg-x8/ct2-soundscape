import { customType, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export class ContentFlags {
    static readonly sqlType = customType<{ data: ContentFlags; driverData: number; nonNull: true; default: true }>({
        dataType() {
            return "int";
        },
        toDriver(self) {
            return self.value;
        },
        fromDriver(value) {
            return new ContentFlags(value);
        },
    });

    static readonly EMPTY = new ContentFlags(0);
    static readonly ALLOW_DOWNLOAD = new ContentFlags(0x01);

    static fromBooleans(flags: { readonly allowDownload: boolean }): ContentFlags {
        return flags.allowDownload ? ContentFlags.ALLOW_DOWNLOAD : ContentFlags.EMPTY;
    }

    static concat(...args: ContentFlags[]): ContentFlags {
        return new ContentFlags(args.reduce((a, b) => a | b.value, 0));
    }

    static fromJSON(value: unknown): ContentFlags {
        if (typeof value !== "number") {
            throw new Error("Invalid jsonified ContentFlags");
        }

        return new ContentFlags(value);
    }

    constructor(readonly value: number = 0) {}

    toJSON(): unknown {
        return this.value;
    }

    has(bits: number): boolean;
    has(other: ContentFlags): boolean;
    has(other: number | ContentFlags): boolean {
        if (typeof other === "number") {
            return (this.value & other) !== 0;
        }

        return (this.value & other.value) !== 0;
    }

    merge(bits: number): ContentFlags;
    merge(other: ContentFlags): ContentFlags;
    merge(other: number | ContentFlags): ContentFlags {
        if (typeof other === "number") {
            return new ContentFlags(this.value | other);
        }

        return new ContentFlags(this.value | other.value);
    }

    get downloadAllowed(): boolean {
        return this.has(ContentFlags.ALLOW_DOWNLOAD);
    }

    allowDownload(): ContentFlags {
        return this.merge(ContentFlags.ALLOW_DOWNLOAD);
    }
}

export const details = sqliteTable("details", {
    id: integer("id").primaryKey(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    genre: text("genre").notNull(),
    minBPM: integer("min_bpm").notNull(),
    maxBPM: integer("max_bpm").notNull(),
    dateJst: integer("date_jst", { mode: "timestamp" }).notNull(),
    comment: text("comment").notNull().default(""),
    flags: ContentFlags.sqlType("flags").notNull().default(new ContentFlags()),
    downloadCount: integer("download_count").notNull().default(0),
});
export type Details = Readonly<typeof details.$inferSelect>;
export type DetailsInsert = Readonly<typeof details.$inferInsert>;
