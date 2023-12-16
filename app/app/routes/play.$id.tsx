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

    return { audioSource, title: contentDetails.title };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
    const pageTitle = data ? `${data.title} - Soundscape` : "Soundscape";

    return [{ title: pageTitle }];
};

export function shouldRevalidate() {
    // 毎回署名付きURLを作ってもらう
    return true;
}

export default function Page() {
    const { audioSource, title } = useLoaderData<typeof loader>();

    return <Player source={audioSource} title={title} />;
}
