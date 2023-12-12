/// <reference types="@remix-run/dev" />
/// <reference types="@remix-run/cloudflare" />

import "@remix-run/server-runtime";

declare module "__STATIC_CONTENT_MANIFEST" {
    const manifest: string;
    export default manifest;
}

declare module "@remix-run/server-runtime" {
    export interface AppLoadContext {
        readonly env: {
            readonly INFO_STORE: D1Database;
            readonly OBJECT_STORE: R2Bucket;
        };
    }
}
