import { data } from "react-router";
import { ContentId } from "soundscape-shared/src/content/id";
import { pick } from "soundscape-shared/src/utils/typeImpl";
import { createRepositoryAccess } from "src/repository";
import type { Details } from "~/components/DetailsPane";
import { type Route } from "./+types/content.$id.details";

const cacheLength = 60 * 60 * 24 * 30;

export async function loader({ context, params }: Route.LoaderArgs) {
    const result = await createRepositoryAccess(context.env, context.ctx).get(
        new ContentId.External(Number(params["id"]))
    );
    if (!result) throw new Response("not found", { status: 404 });

    return data(
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
