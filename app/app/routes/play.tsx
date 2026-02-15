import { useEffect } from "react";
import { data, useOutletContext } from "react-router";
import { ContentId } from "soundscape-shared/src/content/id";
import { createRepositoryAccess } from "src/repository";
import Player from "~/components/Player";
import type { Content } from "~/root";
import { type Route } from "./+types/play.$id";

export async function loader({ params, context: { env, ctx } }: Route.LoaderArgs) {
    const contentRepository = createRepositoryAccess(env, ctx);
    const id = new ContentId.External(Number(params["id"]));
    const [audioSource, details] = await Promise.all([
        contentRepository.getContentUrl(id),
        contentRepository.get(id).then((x) =>
            x === undefined
                ? undefined
                : {
                      id: id.value,
                      title: x.title,
                      artist: x.artist,
                      genre: x.genre,
                      year: x.dateJst.getFullYear(),
                      month: x.dateJst.getMonth() + 1,
                      day: x.dateJst.getDate(),
                  }
        ),
    ]);
    if (!audioSource || !details) {
        throw new Response("", { status: 404 });
    }

    return data(
        { audioSource, details },
        { headers: new Headers({ "Cache-Control": "max-age=3540, must-revalidate" }) }
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
