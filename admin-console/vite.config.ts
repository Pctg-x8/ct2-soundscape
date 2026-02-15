import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import path from "path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [
        cloudflare({
            persistState: { path: path.join(__dirname, "../.wrangler/state") },
            viteEnvironment: { name: "ssr" },
        }),
        reactRouter(),
        tsconfigPaths(),
    ],
});
