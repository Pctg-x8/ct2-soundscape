import { type LoaderFunctionArgs, defer } from "@remix-run/cloudflare";
import { Await, useLoaderData } from "@remix-run/react";
import { Suspense } from "react";

export function loader({ context }: LoaderFunctionArgs) {
    const ids = context.contentRepository.allDetails;

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
