// content model

import { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { ContentFlags, Details, details as detailsTable } from "./schema";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";

export type ContentDetails = {
    readonly title: string;
    readonly comment: string;
    readonly dateJst: Date;
    readonly flags: ContentFlags;
};

export interface ContentRepository {
    get allDetails(): Promise<Details[]>;
    /**
     * @returns id of the content
     */
    add(details: ContentDetails, content: File): Promise<number>;
    add(details: ContentDetails, contentStream: ReadableStream): Promise<number>;
    delete(id: number): Promise<void>;
}

export class CloudflareContentRepository implements ContentRepository {
    constructor(private readonly infoStore: D1Database, private readonly objectStore: R2Bucket) {
    }

    get allDetails(): Promise<Details[]> {
        return drizzle(this.infoStore).select().from(detailsTable).all();
    }

    async add(details: ContentDetails, content: File | ReadableStream): Promise<number> {
        const db = drizzle(this.infoStore);

        const [inserted] = await db.insert(detailsTable).values([{
            title: details.title,
            comment: details.comment,
            dateJst: details.dateJst,
            flags: details.flags
        }]).returning({ id: detailsTable.id }).execute();

        try {
            await this.objectStore.put(inserted.id.toString(), content);
        } catch (e) {
            await db.delete(detailsTable).where(eq(detailsTable.id, inserted.id)).execute();
            throw e;
        }

        return inserted.id;
    }

    async delete(id: number): Promise<void> {
        const db = drizzle(this.infoStore);

        const [recovered] = await db.delete(detailsTable).where(eq(detailsTable.id, id)).returning().execute();

        try {
            await this.objectStore.delete(id.toString());
        } catch (e) {
            await db.insert(detailsTable).values([recovered]).execute();
            throw e;
        }
    }
}
