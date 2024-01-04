import { json, type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { ContentId } from "soundscape-shared/src/content/id";
import type { Details } from "~/components/DetailsPane";
import { pick } from "soundscape-shared/src/utils/typeImpl";

const cacheLength = 60 * 60 * 24 * 30;

export async function loader({ context, params }: LoaderFunctionArgs) {
    const result = await context.contentRepository.get(new ContentId.External(Number(params["id"])));
    if (!result) throw new Response("not found", { status: 404 });

    return json(
        {
            id: Number(params["id"]),
            ...pick(result, "title", "artist", "genre", "bpmRange", "comment", "license"),
            year: result.dateJst.getFullYear(),
            month: result.dateJst.getMonth() + 1,
            day: result.dateJst.getDate(),
        } satisfies Details,
        { headers: { "Cache-Control": `public, max-age=${cacheLength}, s-maxage=${cacheLength}` } }
    );
}
