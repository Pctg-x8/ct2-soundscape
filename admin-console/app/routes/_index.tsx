import type { MetaFunction } from "@remix-run/cloudflare";

export const meta: MetaFunction = () => {
    return [{ title: "Soundscape (Admin Console)" }];
};

export default function Index() {
    return <section></section>;
}
