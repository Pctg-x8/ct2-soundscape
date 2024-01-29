import type { HeadersArgs, MetaFunction } from "@remix-run/cloudflare";
import { useLoaderData, useOutletContext } from "@remix-run/react";
import { json, type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { useEffect } from "react";
import { ContentId } from "soundscape-shared/src/content/id";
import Player from "~/components/Player";
import type { Content } from "~/root";

export async function loader({ params, context: { contentRepository } }: LoaderFunctionArgs) {
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

    return json(
        { audioSource, details },
        { headers: new Headers({ "Cache-Control": "max-age=3540, must-revalidate" }) }
    );
}

export function headers({ loaderHeaders }: HeadersArgs) {
    return { "Cache-Control": loaderHeaders.get("Cache-Control") };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
    const pageTitle = data ? `${data.details.artist} - ${data.details.title} - Soundscape` : "Soundscape";

    return [{ title: pageTitle }];
};

export default function Page() {
    const { audioSource, details } = useLoaderData<typeof loader>();
    const { openGroupForContent } = useOutletContext<{ readonly openGroupForContent: (c: Content) => void }>();

    useEffect(() => {
        openGroupForContent(details);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [details]);

    return <Player source={audioSource} title={`${details.artist} - ${details.title}`} />;
}
