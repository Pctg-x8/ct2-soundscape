import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/server-runtime";
import { ContentId } from "soundscape-shared/src/content";

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

export default function Player() {
    const { audioSource } = useLoaderData<typeof loader>();

    return (
        <section>
            <audio src={audioSource} controls />
        </section>
    );
}
