// content model

import { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { ContentFlags, details as detailsTable } from "./schema";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { skip32 } from "./skip32";
// @ts-ignore なぜか定義が見つけられないので一旦封じる
import { AwsClient } from "aws4fetch";

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

export type NumRange = { readonly min: number; readonly max: number };

export type ContentDetails = {
    readonly title: string;
    readonly artist: string;
    readonly genre: string;
    readonly bpmRange: NumRange;
    readonly comment: string;
    readonly dateJst: Date;
    readonly flags: ContentFlags;
    readonly downloadCount: number;
};
export type IdentifiedContentDetails = ContentDetails & { readonly id: ContentId.External };

export interface ContentReadonlyRepository {
    get allDetails(): Promise<IdentifiedContentDetails[]>;
    get(id: ContentId.Untyped): Promise<ContentDetails | undefined>;
    getContentUrl(id: ContentId.Untyped): Promise<string | undefined>;
}

export interface ContentRepository extends ContentReadonlyRepository {
    /**
     * @returns id of the content
     */
    add(
        details: Omit<ContentDetails, "downloadCount">,
        contentType: string,
        content: File
    ): Promise<ContentId.External>;
    add(
        details: Omit<ContentDetails, "downloadCount">,
        contentType: string,
        contentStream: ReadableStream
    ): Promise<ContentId.External>;

    update(id: ContentId.Untyped, details: Partial<ContentDetails>): Promise<void>;
    update(id: ContentId.Untyped, details: Partial<ContentDetails>, contentType: string, content: File): Promise<void>;
    update(
        id: ContentId.Untyped,
        details: Partial<ContentDetails>,
        contentType: string,
        contentStream: ReadableStream
    ): Promise<void>;

    delete(id: ContentId.Untyped): Promise<void>;
}

export class CloudflareLocalContentReadonlyRepository implements ContentReadonlyRepository {
    constructor(
        protected readonly idObfuscator: ContentIdObfuscator,
        protected readonly infoStore: D1Database,
        protected readonly objectStore: R2Bucket,
        protected readonly objectStoreMountPath: string
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
                    artist: x.artist,
                    genre: x.genre,
                    bpmRange: { min: x.minBPM, max: x.maxBPM },
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
                artist: detailsTable.artist,
                genre: detailsTable.genre,
                bpmRange: { min: detailsTable.minBPM, max: detailsTable.maxBPM },
                comment: detailsTable.comment,
                dateJst: detailsTable.dateJst,
                flags: detailsTable.flags,
                downloadCount: detailsTable.downloadCount,
            })
            .from(detailsTable)
            .where(eq(detailsTable.id, id.toInternal(this.idObfuscator).value))
            .get();
    }

    async getContentUrl(id: ContentId.Untyped): Promise<string | undefined> {
        const url = new URL("http://localhost:8787/");
        url.pathname = `${this.objectStoreMountPath}/${id.toInternal(this.idObfuscator).value}`;

        return Promise.resolve(url.toString());
    }
}

export class CloudflareLocalContentRepository
    extends CloudflareLocalContentReadonlyRepository
    implements ContentRepository
{
    async add(
        details: Omit<ContentDetails, "downloadCount">,
        contentType: string,
        content: File | ReadableStream
    ): Promise<ContentId.External> {
        const db = drizzle(this.infoStore);

        const [inserted] = await db
            .insert(detailsTable)
            .values([
                {
                    title: details.title,
                    artist: details.artist,
                    genre: details.genre,
                    minBPM: details.bpmRange.min,
                    maxBPM: details.bpmRange.max,
                    comment: details.comment,
                    dateJst: details.dateJst,
                    flags: details.flags,
                },
            ])
            .returning({ id: detailsTable.id })
            .execute();

        try {
            await this.objectStore.put(inserted.id.toString(), content, {
                httpMetadata: new Headers({ "Content-Type": contentType }),
            });
        } catch (e) {
            await db.delete(detailsTable).where(eq(detailsTable.id, inserted.id)).execute();
            throw e;
        }

        return new ContentId.Internal(inserted.id).toExternal(this.idObfuscator);
    }

    async update(
        id: ContentId.Untyped,
        details: Partial<ContentDetails>,
        contentType?: string,
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
                await this.objectStore.put(id.toString(), content, {
                    httpMetadata: new Headers({ "Content-Type": contentType! }),
                });
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

export class CloudflareContentReadonlyRepository implements ContentReadonlyRepository {
    constructor(
        protected readonly idObfuscator: ContentIdObfuscator,
        protected readonly infoStore: D1Database,
        protected readonly objectStore: R2Bucket,
        protected readonly objectStoreS3Client: AwsClient,
        protected readonly objectStoreS3Endpoint: URL
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
                    artist: x.artist,
                    genre: x.genre,
                    bpmRange: { min: x.minBPM, max: x.maxBPM },
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
                artist: detailsTable.artist,
                genre: detailsTable.genre,
                bpmRange: { min: detailsTable.minBPM, max: detailsTable.maxBPM },
                comment: detailsTable.comment,
                dateJst: detailsTable.dateJst,
                flags: detailsTable.flags,
                downloadCount: detailsTable.downloadCount,
            })
            .from(detailsTable)
            .where(eq(detailsTable.id, id.toInternal(this.idObfuscator).value))
            .get();
    }

    async getContentUrl(id: ContentId.Untyped): Promise<string | undefined> {
        const url = new URL(this.objectStoreS3Endpoint);
        url.pathname = id.toInternal(this.idObfuscator).value.toString();
        // available for 1 hour
        url.searchParams.set("X-Amz-Expires", "3600");

        return await this.objectStoreS3Client
            .sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } })
            .then((x: Request) => x.url);
    }
}

export class CloudflareContentRepository extends CloudflareContentReadonlyRepository implements ContentRepository {
    async add(
        details: Omit<ContentDetails, "downloadCount">,
        contentType: string,
        content: File | ReadableStream
    ): Promise<ContentId.External> {
        const db = drizzle(this.infoStore);

        const [inserted] = await db
            .insert(detailsTable)
            .values([
                {
                    title: details.title,
                    artist: details.artist,
                    genre: details.genre,
                    minBPM: details.bpmRange.min,
                    maxBPM: details.bpmRange.max,
                    comment: details.comment,
                    dateJst: details.dateJst,
                    flags: details.flags,
                },
            ])
            .returning({ id: detailsTable.id })
            .execute();

        try {
            await this.objectStore.put(inserted.id.toString(), content, {
                httpMetadata: new Headers({ "Content-Type": contentType }),
            });
        } catch (e) {
            await db.delete(detailsTable).where(eq(detailsTable.id, inserted.id)).execute();
            throw e;
        }

        return new ContentId.Internal(inserted.id).toExternal(this.idObfuscator);
    }

    async update(
        id: ContentId.Untyped,
        details: Partial<ContentDetails>,
        contentType?: string,
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
                await this.objectStore.put(id.toString(), content, {
                    httpMetadata: new Headers({ "Content-Type": contentType! }),
                });
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
