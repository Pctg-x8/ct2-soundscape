import { json, type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { ContentId } from "soundscape-shared/src/content";
import type { Details } from "~/components/DetailsPane";
import { pick } from "soundscape-shared/src/utils/typeImpl";

export async function loader({ context, params }: LoaderFunctionArgs) {
    const result = await context.contentRepository.get(new ContentId.External(Number(params["id"])));
    if (!result) throw new Response("not found", { status: 404 });

    return json({
        ...pick(result, "title", "artist", "genre", "bpmRange", "comment", "license"),
        // TODO: Download Link URL
    } satisfies Details);
}

export function headers(): HeadersInit {
    const cacheLength = 60 * 60 * 24 * 30;

    return { "Cache-Control": `max-age=${cacheLength}; s-maxage=${cacheLength}` };
}
