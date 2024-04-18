import { createPagesFunctionHandler } from "@remix-run/cloudflare-pages";
// @ts-ignore
import * as build from "../build/server";
import { getLoadContext } from "../load-context";

export const onRequest = createPagesFunctionHandler({
    // @ts-ignore
    build,
    getLoadContext,
});
