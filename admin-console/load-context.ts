import { type AppLoadContext } from "@remix-run/cloudflare";
import { type PlatformProxy } from "wrangler";

type Cloudflare = Omit<PlatformProxy<Env>, "dispose">;
declare module "@remix-run/cloudflare" {
    interface AppLoadContext {
        readonly env: Env;
        readonly executionContext: ExecutionContext
    }
}

type GetLoadContextArgs = {
    readonly request: Request;
    readonly context: { readonly cloudflare: Cloudflare; };
};
export function getLoadContext({ context }: GetLoadContextArgs): AppLoadContext {
    return { env: context.cloudflare.env, executionContext: context.cloudflare.ctx };
}
