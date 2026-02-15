import { ContentId } from "soundscape-shared/src/content/id";
import { notFound } from "soundscape-shared/src/utils/genericResponse";
import { pick } from "soundscape-shared/src/utils/typeImpl";
import { createRepositoryAccess } from "src/repository";
import * as z from "zod";
import type { Details } from "~/components/DetailsPane";
import { type Route } from "./+types/contentDetails";

const cacheLength = 60 * 60 * 24 * 30;

const ParamsSchema = z.object({ id: ContentId.External.ZodPathParamSchema });

export async function loader({ context, params }: Route.LoaderArgs) {
    const paramsTyped = ParamsSchema.safeParse(params);
    if (!paramsTyped.success) {
        console.error("invalid params", paramsTyped.error);
        throw notFound();
    }

    const result = await createRepositoryAccess(context.env, context.ctx).get(paramsTyped.data.id);
    if (!result) {
        throw notFound();
    }

    return Response.json(
        {
            id: paramsTyped.data.id.value,
            ...pick(result, "title", "artist", "genre", "bpmRange", "comment", "license"),
            year: result.dateJst.getFullYear(),
            month: result.dateJst.getMonth() + 1,
            day: result.dateJst.getDate(),
        } satisfies Details,
        { headers: { "Cache-Control": `public, max-age=${cacheLength}, s-maxage=${cacheLength}` } },
    );
}
