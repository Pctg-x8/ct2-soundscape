// content model

import { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { ContentFlags, Details, details as detailsTable } from "./schema";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { skip32 } from "./skip32";

export interface ContentIdObfuscator {
    obfuscate(internalId: number): number;
    deobfuscate(externalId: number): number;
}

export class Skip32ContentIdObfuscator implements ContentIdObfuscator {
    constructor(private readonly key: Uint8Array) {}

    obfuscate(internalId: number): number {
        return skip32(this.key, internalId, true);
    }

    deobfuscate(externalId: number): number {
        return skip32(this.key, externalId, false);
    }
}

export namespace ContentId {
    export interface Untyped {
        get value(): number;
        toInternal(ctx: ContentIdObfuscator): Internal;
        toExternal(ctx: ContentIdObfuscator): External;
    }
    export class Internal implements Untyped {
        constructor(readonly value: number) {}

        toInternal(_ctx: ContentIdObfuscator): Internal {
            return this;
        }
        toExternal(ctx: ContentIdObfuscator): External {
            return new External(ctx.obfuscate(this.value));
        }
    }
    export class External implements Untyped {
        constructor(readonly value: number) {}

        toInternal(ctx: ContentIdObfuscator): Internal {
            return new Internal(ctx.deobfuscate(this.value));
        }
        toExternal(_ctx: ContentIdObfuscator): External {
            return this;
        }
    }
}

export type ContentDetails = {
    readonly title: string;
    readonly comment: string;
    readonly dateJst: Date;
    readonly flags: ContentFlags;
    readonly downloadCount: number;
};
export type IdentifiedContentDetails = ContentDetails & { readonly id: ContentId.External };

export interface ContentRepository {
    get allDetails(): Promise<IdentifiedContentDetails[]>;

    get(id: ContentId.Untyped): Promise<ContentDetails | undefined>;

    /**
     * @returns id of the content
     */
    add(details: Omit<ContentDetails, "downloadCount">, content: File): Promise<ContentId.External>;
    add(details: Omit<ContentDetails, "downloadCount">, contentStream: ReadableStream): Promise<ContentId.External>;

    update(id: ContentId.Untyped, details: Partial<ContentDetails>): Promise<void>;
    update(id: ContentId.Untyped, details: Partial<ContentDetails>, content: File): Promise<void>;
    update(id: ContentId.Untyped, details: Partial<ContentDetails>, contentStream: ReadableStream): Promise<void>;

    delete(id: ContentId.Untyped): Promise<void>;
}

export class CloudflareContentRepository implements ContentRepository {
    constructor(
        private readonly idObfuscator: ContentIdObfuscator,
        private readonly infoStore: D1Database,
        private readonly objectStore: R2Bucket
    ) {}

    get allDetails(): Promise<IdentifiedContentDetails[]> {
        return drizzle(this.infoStore)
            .select()
            .from(detailsTable)
            .all()
            .then((xs) =>
                xs.map((x) => ({
                    id: new ContentId.Internal(x.id).toExternal(this.idObfuscator),
                    title: x.title,
                    comment: x.comment,
                    dateJst: x.dateJst,
                    flags: x.flags,
                    downloadCount: x.downloadCount,
                }))
            );
    }

    async get(id: ContentId.Untyped): Promise<ContentDetails | undefined> {
        return await drizzle(this.infoStore)
            .select({
                title: detailsTable.title,
                comment: detailsTable.comment,
                dateJst: detailsTable.dateJst,
                flags: detailsTable.flags,
                downloadCount: detailsTable.downloadCount,
            })
            .from(detailsTable)
            .where(eq(detailsTable.id, id.toInternal(this.idObfuscator).value))
            .get();
    }

    async add(
        details: Omit<ContentDetails, "downloadCount">,
        content: File | ReadableStream
    ): Promise<ContentId.External> {
        const db = drizzle(this.infoStore);

        const [inserted] = await db
            .insert(detailsTable)
            .values([
                {
                    title: details.title,
                    comment: details.comment,
                    dateJst: details.dateJst,
                    flags: details.flags,
                },
            ])
            .returning({ id: detailsTable.id })
            .execute();

        try {
            await this.objectStore.put(inserted.id.toString(), content);
        } catch (e) {
            await db.delete(detailsTable).where(eq(detailsTable.id, inserted.id)).execute();
            throw e;
        }

        return new ContentId.Internal(inserted.id).toExternal(this.idObfuscator);
    }

    async update(
        id: ContentId.Untyped,
        details: Partial<ContentDetails>,
        content?: File | ReadableStream
    ): Promise<void> {
        const db = drizzle(this.infoStore);
        const internalId = id.toInternal(this.idObfuscator).value;

        const [oldContent] = await db
            .update(detailsTable)
            .set(details)
            .where(eq(detailsTable.id, internalId))
            .returning()
            .execute();

        try {
            if (content !== undefined && content !== null) {
                await this.objectStore.put(id.toString(), content);
            }
        } catch (e) {
            await db.update(detailsTable).set(oldContent).where(eq(detailsTable.id, internalId)).execute();
            throw e;
        }
    }

    async delete(id: ContentId.Untyped): Promise<void> {
        const db = drizzle(this.infoStore);

        const [recovered] = await db
            .delete(detailsTable)
            .where(eq(detailsTable.id, id.toInternal(this.idObfuscator).value))
            .returning()
            .execute();

        try {
            await this.objectStore.delete(id.toString());
        } catch (e) {
            await db.insert(detailsTable).values([recovered]).execute();
            throw e;
        }
    }
}
