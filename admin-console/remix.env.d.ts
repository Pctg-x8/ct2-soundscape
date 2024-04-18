/// <reference types="@remix-run/dev" />
/// <reference types="@remix-run/cloudflare" />

import "@remix-run/server-runtime";

declare module "__STATIC_CONTENT_MANIFEST" {
    const manifest: string;
    export default manifest;
}
