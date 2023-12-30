import type { MetaFunction } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/server-runtime";
import { ContentId } from "soundscape-shared/src/content";
import Player from "~/components/Player";

export async function loader({ params, context: { contentRepository } }: LoaderFunctionArgs) {
    const id = new ContentId.External(Number(params["id"]));
    const [audioSource, contentDetails] = await Promise.all([
        contentRepository.getContentUrl(id),
        contentRepository.get(id),
    ]);
    if (!audioSource || !contentDetails) {
        throw new Response("", { status: 404 });
    }

    return { audioSource, title: contentDetails.title, artist: contentDetails.artist };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
    const pageTitle = data ? `${data.artist} - ${data.title} - Soundscape` : "Soundscape";

    return [{ title: pageTitle }];
};

export default function Page() {
    const { audioSource, title, artist } = useLoaderData<typeof loader>();

    return <Player source={audioSource} title={`${artist} - ${title}`} />;
}
