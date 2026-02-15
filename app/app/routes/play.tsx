import { useEffect } from "react";
import { data, useOutletContext } from "react-router";
import { ContentId } from "soundscape-shared/src/content/id";
import { notFound } from "soundscape-shared/src/utils/genericResponse";
import { pick } from "soundscape-shared/src/utils/typeImpl";
import { createRepositoryAccess } from "src/repository";
import * as z from "zod";
import Player from "~/components/Player";
import type { Content } from "~/root";
import { type Route } from "./+types/play";

const ParamsSchema = z.object({ id: ContentId.External.ZodPathParamSchema });

export async function loader({ params, context: { env, ctx } }: Route.LoaderArgs) {
    const paramsTyped = ParamsSchema.safeParse(params);
    if (!paramsTyped.success) {
        console.error("invalid params", paramsTyped.error);
        throw notFound();
    }

    const contentRepository = createRepositoryAccess(env, ctx);
    const [audioSource, details] = await Promise.all([
        contentRepository.getContentUrl(paramsTyped.data.id),
        contentRepository.get(paramsTyped.data.id),
    ]);
    if (!audioSource || !details) {
        throw notFound();
    }

    return data(
        {
            audioSource,
            details: {
                id: paramsTyped.data.id.value,
                ...pick(details, "title", "artist", "genre"),
                year: details.dateJst.getFullYear(),
                month: details.dateJst.getMonth() + 1,
                day: details.dateJst.getDate(),
            },
        },
        { headers: new Headers({ "Cache-Control": "max-age=3540, must-revalidate" }) },
    );
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
    return { "Cache-Control": loaderHeaders.get("Cache-Control") };
}

export default function Page({ loaderData: { audioSource, details } }: Route.ComponentProps) {
    const { openGroupForContent } = useOutletContext<{ readonly openGroupForContent: (c: Content) => void }>();

    useEffect(() => {
        openGroupForContent(details);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [details]);

    return (
        <>
            <title>
                {details.artist} - {details.title} - Soundscape
            </title>
            <Player source={audioSource} title={`${details.artist} - ${details.title}`} />
        </>
    );
}
