import type { MetaDescriptor } from "@remix-run/cloudflare";
import Player from "~/components/Player";

export const meta: MetaDescriptor[] = [{ title: "Soundscape" }];

export default function Page() {
    return <Player title="" />;
}
