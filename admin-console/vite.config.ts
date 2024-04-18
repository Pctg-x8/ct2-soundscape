import { defineConfig } from "vite";
import { vitePlugin as remix, cloudflareDevProxyVitePlugin as remixCloudflareDevProxy } from "@remix-run/dev";
import tsconfigPaths from "vite-tsconfig-paths";
import { getLoadContext } from "./load-context";
import path from "path";

export default defineConfig({
    plugins: [
        remixCloudflareDevProxy({
            getLoadContext,
            persist: { path: path.resolve(__dirname, "../.wrangler/state/v3") },
        }),
        remix(),
        tsconfigPaths(),
    ],
});
