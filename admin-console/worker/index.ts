import { broadcastDevReady, createRequestHandler, logDevReady } from "@remix-run/cloudflare";
import type { Fetcher } from "@remix-run/react";
import * as build from "../build";
import __STATIC_CONTENT_MANIFEST from "__STATIC_CONTENT_MANIFEST";
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
import { CloudflareContentRepository, Skip32ContentIdObfuscator } from "soundscape-shared/src/content";
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

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

        try {
            const idObfuscator = new Skip32ContentIdObfuscator(
                new Uint8Array(JSON.parse(env.CONTENT_ID_OBFUSCATOR_KEY))
            );
            const contentRepository = new CloudflareContentRepository(idObfuscator, env.INFO_STORE, env.OBJECT_STORE);

            return await handleRemixRequest(req, { contentRepository });
        } catch (e) {
            console.error(e);
            return new Response("An unexpected error occured", { status: 500 });
        }
    },
};
