import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/server-runtime";
import { ContentId } from "soundscape-shared/src/content";
import Player from "~/components/Player";

export async function loader({ params, context }: LoaderFunctionArgs) {
    const audioSource = await context.contentRepository.getContentUrl(new ContentId.External(Number(params["id"])));
    if (!audioSource) {
        throw new Response("", { status: 404 });
    }

    return { audioSource };
}

export function shouldRevalidate() {
    return true;
}

export default function Page() {
    const { audioSource } = useLoaderData<typeof loader>();

    return <Player source={audioSource} />;
}
