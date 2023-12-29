import { broadcastDevReady, createRequestHandler, logDevReady } from "@remix-run/cloudflare";
import type { Fetcher } from "@remix-run/react";
import * as build from "../build";
import __STATIC_CONTENT_MANIFEST from "__STATIC_CONTENT_MANIFEST";
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
import {
    CloudflareContentRepository,
    CloudflareLocalContentRepository,
    type ContentRepository,
    Skip32ContentIdObfuscator,
} from "soundscape-shared/src/content";
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
// @ts-ignore
import { AwsClient } from "aws4fetch";
import { parseHexStringBytes } from "soundscape-shared/src/utils/hexstring";

const MANIFEST = JSON.parse(__STATIC_CONTENT_MANIFEST);
const handleRemixRequest = createRequestHandler(build, process.env.NODE_ENV);

if (process.env.NODE_ENV === "development") {
    logDevReady(build);
    broadcastDevReady(build);
}

type FetchEnv = {
    readonly __STATIC_CONTENT: Fetcher;
    readonly INFO_STORE: D1Database;
    readonly OBJECT_STORE: R2Bucket;
    readonly CONTENT_ID_OBFUSCATOR_KEY: string;
    readonly OBJECT_STORE_S3_ACCESS_KEY: string;
    readonly OBJECT_STORE_S3_SECRET_ACCESS_KEY: string;
    readonly OBJECT_STORE_S3_ENDPOINT: string;
};

export default {
    async fetch(req: Request, env: FetchEnv, ctx: ExecutionContext): Promise<Response> {
        try {
            const url = new URL(req.url);
            const ttl = url.pathname.startsWith("/build/") ? 60 * 60 * 24 * 365 : 60 * 5;

            return await getAssetFromKV(
                { request: req, waitUntil: ctx.waitUntil.bind(ctx) },
                {
                    ASSET_NAMESPACE: env.__STATIC_CONTENT,
                    ASSET_MANIFEST: MANIFEST,
                    cacheControl: { browserTTL: ttl, edgeTTL: ttl },
                }
            );
        } catch (e) {}

        if (process.env.NODE_ENV === "development") {
            // forwarding local r2 repository
            const matches = new URLPattern("/r2-local/:path", req.url).exec(req.url);
            if (matches) {
                const object = await env.OBJECT_STORE.get(matches.pathname.groups["path"]);
                if (!object) {
                    return new Response("", { status: 404 });
                }

                return new Response(object.body as ReadableStream);
            }
        }

        try {
            const idObfuscator = new Skip32ContentIdObfuscator(parseHexStringBytes(env.CONTENT_ID_OBFUSCATOR_KEY));

            let contentRepository: ContentRepository;
            if (process.env.NODE_ENV === "development") {
                contentRepository = new CloudflareLocalContentRepository(
                    idObfuscator,
                    env.INFO_STORE,
                    env.OBJECT_STORE,
                    "/r2-local"
                );
            } else {
                const objectStoreS3Client = new AwsClient({
                    accessKeyId: env.OBJECT_STORE_S3_ACCESS_KEY,
                    secretAccessKey: env.OBJECT_STORE_S3_SECRET_ACCESS_KEY,
                });

                contentRepository = new CloudflareContentRepository(
                    idObfuscator,
                    env.INFO_STORE,
                    env.OBJECT_STORE,
                    objectStoreS3Client,
                    new URL(env.OBJECT_STORE_S3_ENDPOINT)
                );
            }

            return await handleRemixRequest(req, { contentRepository });
        } catch (e) {
            console.error(e);
            return new Response("An unexpected error occured", { status: 500 });
        }
    },
};
