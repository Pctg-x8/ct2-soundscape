/// <reference types="@remix-run/dev" />
/// <reference types="@remix-run/cloudflare" />

import "@remix-run/server-runtime";
import type { ContentRepository } from "soundscape-shared/src/content";

declare module "__STATIC_CONTENT_MANIFEST" {
    const manifest: string;
    export default manifest;
}

declare module "@remix-run/server-runtime" {
    export interface AppLoadContext {
        readonly contentRepository: ContentRepository;
    }
}
