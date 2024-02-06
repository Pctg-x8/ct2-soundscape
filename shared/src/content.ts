// content model

import { D1Database, R2Bucket, ReadableStream, fetch } from "@cloudflare/workers-types";
import { License } from "./valueObjects/license";
import * as schema from "./schema";
import { drizzle } from "drizzle-orm/d1";
import { count, eq, sql } from "drizzle-orm";
import { unwrapNullishOr } from "./utils/nullish";
import { _let } from "./utils";
import { pick } from "./utils/typeImpl";
import { ContentId, ContentIdObfuscator } from "./content/id";
import { ContentStreamingUrlProvider } from "./content/streamUrlProvider";
import { ReversibleOperation } from "./utils/ReversibleOperation";

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
export type AddedContentDetails = Omit<ContentDetails, "downloadCount">;

export type ContentDownloadInfo = {
    readonly title: string;
    readonly artist: string;
    readonly contentType: string;
    readonly stream: ReadableStream;
};
export type ContentUploadMultipartInfo = {
    readonly key: string;
    readonly id: string;
};

export interface ContentRepository {
    get allDetails(): Promise<IdentifiedContentDetails[]>;
    get yearWithContentCount(): Promise<[number, number][]>;
    getDetailsByYear(year: number): Promise<IdentifiedContentDetails[]>;
    get(id: ContentId.Untyped): Promise<ContentDetails | undefined>;
    getContentUrl(id: ContentId.Untyped): Promise<string | undefined>;
    download(id: ContentId.Untyped): Promise<ContentDownloadInfo | undefined>;
}

export interface ContentAdminRepository extends ContentRepository {
    add(details: AddedContentDetails, contentType: string, content: File): Promise<ContentId.External>;
    add(details: AddedContentDetails, contentType: string, contentStream: ReadableStream): Promise<ContentId.External>;

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

export interface ContentAdminMultipartRepository extends ContentAdminRepository {
    beginMultipartUploading(contentType: string): Promise<ReversibleOperation<ContentId.External>>;
    uploadPart(contentId: ContentId.Untyped, partNumber: number, data: ArrayBuffer): Promise<R2UploadedPart>;
    abortMultipartUploading(contentId: ContentId.Untyped): Promise<ReversibleOperation>;
    completeMultipartUploading(
        contentId: ContentId.Untyped,
        details: AddedContentDetails,
        parts: R2UploadedPart[]
    ): Promise<ReversibleOperation>;
}

export class CloudflareContentRepository implements ContentRepository {
    constructor(
        protected readonly idObfuscator: ContentIdObfuscator,
        protected readonly infoStore: D1Database,
        protected readonly objectStore: R2Bucket,
        protected readonly streamingUrlProvider: ContentStreamingUrlProvider
    ) {}

    protected connectInfoStore() {
        return drizzle(this.infoStore, { schema });
    }

    private detailsFromDBRow(row: schema.Details): ContentDetails {
        return {
            ...pick(row, "title", "artist", "genre", "comment", "downloadCount"),
            dateJst: new Date(row.year, row.month - 1, row.day),
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

    get yearWithContentCount(): Promise<[number, number][]> {
        return this.connectInfoStore()
            .select({ year: schema.details.year, count: count() })
            .from(schema.details)
            .groupBy(schema.details.year)
            .then((xs) => xs.map((r) => [r.year, r.count]));
    }

    getDetailsByYear(year: number): Promise<IdentifiedContentDetails[]> {
        return this.connectInfoStore()
            .query.details.findMany({
                where: eq(schema.details.year, year),
            })
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

    getContentUrl(id: ContentId.Untyped): Promise<string | undefined> {
        return this.streamingUrlProvider.getUrl(id.toInternal(this.idObfuscator));
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

export class CloudflareContentAdminRepository
    extends CloudflareContentRepository
    implements ContentAdminMultipartRepository
{
    async add(
        details: AddedContentDetails,
        contentType: string,
        content: File | ReadableStream
    ): Promise<ContentId.External> {
        const db = this.connectInfoStore();
        const [licenseType, licenseText] = License.toDBValues(details.license);

        const [inserted] = await db
            .insert(schema.details)
            .values(CloudflareContentAdminRepository.buildInsertRecord(details))
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
                ...pick(details, "title", "artist", "genre", "comment", "downloadCount"),
                year: details.dateJst?.getFullYear(),
                month: _let(details.dateJst?.getMonth(), (x) => (x === undefined ? undefined : x + 1)),
                day: details.dateJst?.getDate(),
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

    async beginMultipartUploading(contentType: string): Promise<ReversibleOperation<ContentId.External>> {
        const db = this.connectInfoStore();
        const issueContentId = async () => {
            const [{ id }] = await db
                .insert(schema.pendingUploads)
                .values({ r2MultipartKey: "", r2MultipartUploadId: "" })
                .returning({ id: schema.pendingUploads.contentId });

            return new ReversibleOperation(id, async () => {
                await this.connectInfoStore()
                    .delete(schema.pendingUploads)
                    .where(eq(schema.pendingUploads.contentId, id));
            });
        };

        // TODO: ほんとうはawait usingを使いたい wranglerが対応してない
        const id = await issueContentId();
        try {
            const upload = await this.objectStore.createMultipartUpload(id.value.toString(), {
                httpMetadata: { contentType },
            });
            await db
                .update(schema.pendingUploads)
                .set({ r2MultipartUploadId: upload.uploadId, r2MultipartKey: upload.key })
                .where(eq(schema.pendingUploads.contentId, id.value));

            return id.moveoutWithValue(new ContentId.Internal(id.value).toExternal(this.idObfuscator));
        } finally {
            await id[Symbol.asyncDispose]();
        }
    }

    async uploadPart(contentId: ContentId.Untyped, partNumber: number, data: ArrayBuffer): Promise<R2UploadedPart> {
        const r = await this.connectInfoStore().query.pendingUploads.findFirst({
            where: eq(schema.pendingUploads.contentId, contentId.toInternal(this.idObfuscator).value),
        });
        if (!r) {
            throw new Error(`#${contentId.value} has no started multipart uploading`);
        }

        return await this.objectStore
            .resumeMultipartUpload(r.r2MultipartKey, r.r2MultipartUploadId)
            .uploadPart(partNumber, data);
    }

    async abortMultipartUploading(contentId: ContentId.Untyped): Promise<ReversibleOperation> {
        const internalId = contentId.toInternal(this.idObfuscator).value;
        const take = async () => {
            const [r] = await this.connectInfoStore()
                .delete(schema.pendingUploads)
                .where(eq(schema.pendingUploads.contentId, internalId))
                .returning();

            return new ReversibleOperation(r, async () => {
                await this.connectInfoStore().insert(schema.pendingUploads).values(r);
            });
        };

        // TODO: 本当はawait usingを使いたい wranglerが対応してない
        const r = await take();
        try {
            await this.objectStore.resumeMultipartUpload(r.value.r2MultipartKey, r.value.r2MultipartUploadId).abort();

            return r.moveoutWithValue(void 0);
        } finally {
            await r[Symbol.asyncDispose]();
        }
    }

    async completeMultipartUploading(
        contentId: ContentId.Untyped,
        details: AddedContentDetails,
        parts: R2UploadedPart[]
    ): Promise<ReversibleOperation> {
        const internalId = contentId.toInternal(this.idObfuscator).value;
        const db = this.connectInfoStore();
        const take = async () => {
            const [r] = await db
                .delete(schema.pendingUploads)
                .where(eq(schema.pendingUploads.contentId, internalId))
                .returning();

            return new ReversibleOperation(r, async () => {
                await this.connectInfoStore().insert(schema.pendingUploads).values(r);
            });
        };

        // TODO: ほんとうはawait usingを使いたい wranglerが対応してない
        const r = await take();
        try {
            await this.objectStore
                .resumeMultipartUpload(r.value.r2MultipartKey, r.value.r2MultipartUploadId)
                .complete(parts);

            await db.insert(schema.details).values({
                id: internalId,
                ...CloudflareContentAdminRepository.buildInsertRecord(details),
            });

            return r.combineDrop(
                new ReversibleOperation(undefined, async () => {
                    await this.connectInfoStore().delete(schema.details).where(eq(schema.details.id, internalId));
                })
            );
        } finally {
            await r[Symbol.asyncDispose]();
        }
    }

    private static buildInsertRecord(x: AddedContentDetails): schema.DetailsInsert {
        const [licenseType, licenseText] = License.toDBValues(x.license);

        return {
            ...pick(x, "title", "artist", "genre", "comment"),
            year: x.dateJst.getFullYear(),
            month: x.dateJst.getMonth() + 1,
            day: x.dateJst.getDate(),
            minBPM: x.bpmRange.min,
            maxBPM: x.bpmRange.max,
            licenseType,
            licenseText,
        };
    }
}
