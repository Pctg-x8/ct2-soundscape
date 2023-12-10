import { LoaderFunctionArgs, defer } from "@remix-run/cloudflare";
import { Await, useLoaderData } from "@remix-run/react";
import { drizzle } from "drizzle-orm/d1";
import { Suspense } from "react";
import { details } from "src/schema";

export function loader({ context: { env } }: LoaderFunctionArgs) {
    const db = drizzle(env.INFO_STORE);
    const ids = db.select({ id: details.id }).from(details).all();

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
