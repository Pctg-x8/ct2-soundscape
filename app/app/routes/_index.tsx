import { type LoaderFunctionArgs, defer } from "@remix-run/cloudflare";
import { Await, useLoaderData } from "@remix-run/react";
import { Suspense } from "react";
import { CloudflareContentRepository } from "soundscape-shared/src/content";

export function loader({ context: { env } }: LoaderFunctionArgs) {
    const ids = new CloudflareContentRepository(env.INFO_STORE, env.OBJECT_STORE).allDetails;

    return defer({ ids });
}

export default function Page() {
    const { ids } = useLoaderData<typeof loader>();

    return (
        <article>
            <p>index</p>
            <Suspense fallback={<p>Loading...</p>}>
                <Await resolve={ids}>{(ids) => <p>Total records: {ids.length}</p>}</Await>
            </Suspense>
        </article>
    );
}
