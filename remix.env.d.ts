/// <reference types="@remix-run/dev" />
/// <reference types="@remix-run/node" />
/// <reference types="@cloudflare/workers-types" />

declare module "__STATIC_CONTENT_MANIFEST" {
    const manifest: string;
    export default manifest;
}
