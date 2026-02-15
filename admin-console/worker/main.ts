import { createRequestHandler } from "react-router";

export const onRequest = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        return onRequest(request, { env, executionContext: ctx });
    },
} satisfies ExportedHandler<Env>;
