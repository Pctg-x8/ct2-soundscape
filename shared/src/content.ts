// content model

import { D1Database, R2Bucket, ReadableStream, fetch } from "@cloudflare/workers-types";
import { License } from "./valueObjects/license";
import * as schema from "./schema";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { skip32 } from "./skip32";
// @ts-ignore なぜか定義が見つけられないので一旦封じる
import { AwsClient } from "aws4fetch";
import { unwrapNullishOr } from "./utils/nullish";
import { _let } from "./utils";
import { pick } from "./utils/typeImpl";

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
    readonly downloadCount: number;
    readonly license: License.Type;
};
export type IdentifiedContentDetails = ContentDetails & { readonly id: ContentId.External };

export type ContentDownloadInfo = {
    readonly title: string;
    readonly artist: string;
    readonly contentType: string;
    readonly stream: ReadableStream;
};

export interface ContentRepository {
    get allDetails(): Promise<IdentifiedContentDetails[]>;
    get(id: ContentId.Untyped): Promise<ContentDetails | undefined>;
    getContentUrl(id: ContentId.Untyped): Promise<string | undefined>;
    download(id: ContentId.Untyped): Promise<ContentDownloadInfo | undefined>;
}

export interface ContentAdminRepository extends ContentRepository {
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

export class CloudflareLocalContentRepository implements ContentRepository {
    constructor(
        protected readonly idObfuscator: ContentIdObfuscator,
        protected readonly infoStore: D1Database,
        protected readonly objectStore: R2Bucket,
        protected readonly objectStoreMountPath: string
    ) {}

    protected connectInfoStore() {
        return drizzle(this.infoStore, { schema });
    }

    private detailsFromDBRow(row: schema.Details): ContentDetails {
        return {
            ...pick(row, "title", "artist", "genre", "comment", "downloadCount", "dateJst"),
            bpmRange: { min: row.minBPM, max: row.maxBPM },
            license: unwrapNullishOr(License.fromDBValues(row.licenseType, row.licenseText), () => {
                throw new Error("invalid license type");
            }),
        };
    }

    get allDetails(): Promise<IdentifiedContentDetails[]> {
        return this.connectInfoStore()
            .query.details.findMany()
            .then((xs) =>
                xs.map((r) => ({
                    ...this.detailsFromDBRow(r),
                    id: new ContentId.Internal(r.id).toExternal(this.idObfuscator),
                }))
            );
    }

    get(id: ContentId.Untyped): Promise<ContentDetails | undefined> {
        return this.connectInfoStore()
            .query.details.findFirst({
                where: eq(schema.details.id, id.toInternal(this.idObfuscator).value),
            })
            .then((r) => (r === undefined ? undefined : this.detailsFromDBRow(r)));
    }

    async getContentUrl(id: ContentId.Untyped): Promise<string | undefined> {
        const url = new URL("http://localhost:8787/");
        url.pathname = `${this.objectStoreMountPath}/${id.toInternal(this.idObfuscator).value}`;

        return Promise.resolve(url.toString());
    }

    async download(id: ContentId.Untyped): Promise<ContentDownloadInfo | undefined> {
        const internalId = id.toInternal(this.idObfuscator);

        const [infoRow, obj] = await Promise.all([
            this.connectInfoStore()
                .update(schema.details)
                .set({ downloadCount: sql`${schema.details.downloadCount} + 1` })
                .where(eq(schema.details.id, internalId.value))
                .returning({ title: schema.details.title, artist: schema.details.artist })
                .then((xs) => xs[0]),
            this.objectStore.get(internalId.value.toString()),
        ]);
        if (!infoRow || !obj) return undefined;

        return {
            title: infoRow.title,
            artist: infoRow.artist,
            contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
            stream: obj.body,
        };
    }
}

export class CloudflareLocalContentAdminRepository
    extends CloudflareLocalContentRepository
    implements ContentAdminRepository
{
    async add(
        details: Omit<ContentDetails, "downloadCount">,
        contentType: string,
        content: File | ReadableStream
    ): Promise<ContentId.External> {
        const db = this.connectInfoStore();
        const [licenseType, licenseText] = License.toDBValues(details.license);

        const [inserted] = await db
            .insert(schema.details)
            .values([
                {
                    ...pick(details, "title", "artist", "genre", "comment", "dateJst"),
                    minBPM: details.bpmRange.min,
                    maxBPM: details.bpmRange.max,
                    licenseType,
                    licenseText,
                },
            ])
            .returning({ id: schema.details.id });

        try {
            await this.objectStore.put(inserted.id.toString(), content, {
                httpMetadata: new Headers({ "Content-Type": contentType }),
            });
        } catch (e) {
            await db.delete(schema.details).where(eq(schema.details.id, inserted.id)).execute();
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
        const db = this.connectInfoStore();
        const internalId = id.toInternal(this.idObfuscator).value;

        const [oldContent] = await db
            .update(schema.details)
            .set({
                ...pick(details, "title", "artist", "genre", "comment", "dateJst", "downloadCount"),
                minBPM: details.bpmRange?.min,
                maxBPM: details.bpmRange?.max,
                ...(details.license === undefined
                    ? {}
                    : _let(License.toDBValues(details.license), ([ty, tx]) => ({ licenseType: ty, licenseText: tx }))),
            })
            .where(eq(schema.details.id, internalId))
            .returning();

        try {
            if (content !== undefined && content !== null) {
                await this.objectStore.put(id.toString(), content, {
                    httpMetadata: new Headers({ "Content-Type": contentType! }),
                });
            }
        } catch (e) {
            await db.update(schema.details).set(oldContent).where(eq(schema.details.id, internalId));
            throw e;
        }
    }

    async delete(id: ContentId.Untyped): Promise<void> {
        const db = this.connectInfoStore();

        const [recovered] = await db
            .delete(schema.details)
            .where(eq(schema.details.id, id.toInternal(this.idObfuscator).value))
            .returning();

        try {
            await this.objectStore.delete(id.toString());
        } catch (e) {
            await db.insert(schema.details).values([recovered]);
            throw e;
        }
    }
}

export class CloudflareContentRepository implements ContentRepository {
    constructor(
        protected readonly idObfuscator: ContentIdObfuscator,
        protected readonly infoStore: D1Database,
        protected readonly objectStore: R2Bucket,
        protected readonly objectStoreS3Client: AwsClient,
        protected readonly objectStoreS3Endpoint: URL,
        protected readonly eventContext: ExecutionContext
    ) {}

    protected connectInfoStore() {
        return drizzle(this.infoStore, { schema });
    }

    private detailsFromDBRow(row: schema.Details): ContentDetails {
        return {
            ...pick(row, "title", "artist", "genre", "comment", "downloadCount", "dateJst"),
            bpmRange: { min: row.minBPM, max: row.maxBPM },
            license: unwrapNullishOr(License.fromDBValues(row.licenseType, row.licenseText), () => {
                throw new Error("invalid license type");
            }),
        };
    }

    get allDetails(): Promise<IdentifiedContentDetails[]> {
        return this.connectInfoStore()
            .query.details.findMany()
            .then((xs) =>
                xs.map((r) => ({
                    ...this.detailsFromDBRow(r),
                    id: new ContentId.Internal(r.id).toExternal(this.idObfuscator),
                }))
            );
    }

    get(id: ContentId.Untyped): Promise<ContentDetails | undefined> {
        return this.connectInfoStore()
            .query.details.findFirst({
                where: eq(schema.details.id, id.toInternal(this.idObfuscator).value),
            })
            .then((x) => (x === undefined ? undefined : this.detailsFromDBRow(x)));
    }

    async getContentUrl(id: ContentId.Untyped): Promise<string | undefined> {
        const url = new URL(this.objectStoreS3Endpoint);
        url.pathname = `soundscape/${id.toInternal(this.idObfuscator).value}`;
        // available for 1 hour
        url.searchParams.set("X-Amz-Expires", "3600");

        const cached = await caches.default.match(new Request(url));
        if (cached !== undefined) {
            return await cached.text();
        }

        const signed = await this.objectStoreS3Client
            .sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } })
            .then((x: Request) => x.url);
        this.eventContext.waitUntil(
            caches.default.put(
                new Request(url),
                new Response(signed, { headers: new Headers({ "Cache-Control": "max-age=3540, must-revalidate" }) })
            )
        );

        return signed;
    }

    async download(id: ContentId.Untyped): Promise<ContentDownloadInfo | undefined> {
        const internalId = id.toInternal(this.idObfuscator);

        const [infoRow, obj] = await Promise.all([
            this.connectInfoStore()
                .update(schema.details)
                .set({ downloadCount: sql`${schema.details.downloadCount} + 1` })
                .where(eq(schema.details.id, internalId.value))
                .returning({ title: schema.details.title, artist: schema.details.artist })
                .then((xs) => xs[0]),
            this.objectStore.get(internalId.value.toString()),
        ]);
        if (!infoRow || !obj) return undefined;

        return {
            title: infoRow.title,
            artist: infoRow.artist,
            contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
            stream: obj.body,
        };
    }
}

export class CloudflareContentAdminRepository extends CloudflareContentRepository implements ContentAdminRepository {
    async add(
        details: Omit<ContentDetails, "downloadCount">,
        contentType: string,
        content: File | ReadableStream
    ): Promise<ContentId.External> {
        const db = this.connectInfoStore();
        const [licenseType, licenseText] = License.toDBValues(details.license);

        const [inserted] = await db
            .insert(schema.details)
            .values([
                {
                    ...pick(details, "title", "artist", "genre", "comment", "dateJst"),
                    minBPM: details.bpmRange.min,
                    maxBPM: details.bpmRange.max,
                    licenseType,
                    licenseText,
                },
            ])
            .returning({ id: schema.details.id });

        try {
            await this.objectStore.put(inserted.id.toString(), content, {
                httpMetadata: new Headers({ "Content-Type": contentType }),
            });
        } catch (e) {
            await db.delete(schema.details).where(eq(schema.details.id, inserted.id));
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
        const db = this.connectInfoStore();
        const internalId = id.toInternal(this.idObfuscator).value;

        const [oldContent] = await db
            .update(schema.details)
            .set({
                ...pick(details, "title", "artist", "genre", "comment", "dateJst", "downloadCount"),
                minBPM: details.bpmRange?.min,
                maxBPM: details.bpmRange?.max,
                ...(details.license === undefined
                    ? {}
                    : _let(License.toDBValues(details.license), ([ty, tx]) => ({ licenseType: ty, licenseText: tx }))),
            })
            .where(eq(schema.details.id, internalId))
            .returning();

        try {
            if (content !== undefined && content !== null) {
                await this.objectStore.put(id.toString(), content, {
                    httpMetadata: new Headers({ "Content-Type": contentType! }),
                });
            }
        } catch (e) {
            await db.update(schema.details).set(oldContent).where(eq(schema.details.id, internalId));
            throw e;
        }
    }

    async delete(id: ContentId.Untyped): Promise<void> {
        const db = this.connectInfoStore();

        const [recovered] = await db
            .delete(schema.details)
            .where(eq(schema.details.id, id.toInternal(this.idObfuscator).value))
            .returning();

        try {
            await this.objectStore.delete(id.toString());
        } catch (e) {
            await db.insert(schema.details).values([recovered]);
            throw e;
        }
    }
}
