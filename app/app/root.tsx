import { cssBundleHref } from "@remix-run/css-bundle";
import { defer, type HeadersArgs, type LinksFunction, type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Await, Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "@remix-run/react";
import { Suspense } from "react";
import "./root.css";
import DetailsPane, { type Details } from "./components/DetailsPane";
import { ContentId } from "soundscape-shared/src/content";

export const links: LinksFunction = () => [
    {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,1,0",
    },
    ...(cssBundleHref ? [{ rel: "stylesheet", href: cssBundleHref }] : []),
];

export type Content = {
    readonly id: number;
    readonly title: string;
    readonly artist: string;
    readonly genre: string;
};

export function loader({ context, request }: LoaderFunctionArgs) {
    const items: Promise<Content[]> = context.contentRepository.allDetails.then((xs) =>
        xs.map((x) => ({
            id: x.id.value,
            title: x.title,
            artist: x.artist,
            genre: x.genre,
        }))
    );

    const detailsTargetID = new URL(request.url).searchParams.get("details");
    const details =
        detailsTargetID === null
            ? undefined
            : context.contentRepository.get(new ContentId.External(Number(detailsTargetID))).then((r) =>
                  r === undefined
                      ? undefined
                      : ({
                            title: r.title,
                            artist: r.artist,
                            genre: r.genre,
                            bpmRange: r.bpmRange,
                            comment: r.comment,
                            license: r.license,
                            // TODO: Download Link URL
                        } satisfies Details)
              );

    return defer({ items, details }, { headers: new Headers({ "Cache-Control": "max-age=3600, must-revalidate" }) });
}

export function headers({ loaderHeaders }: HeadersArgs) {
    return { "Cache-Control": loaderHeaders.get("Cache-Control") };
}

export default function App() {
    const { items, details } = useLoaderData<typeof loader>();

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <Meta />
                <Links />
            </head>
            <body>
                <section id="MainLayout">
                    <section id="Top">
                        <Suspense fallback={<p>Loading...</p>}>
                            <Await resolve={items}>{(items) => <ItemList items={items} />}</Await>
                        </Suspense>
                        <DetailsPane data={details} />
                    </section>
                    <Outlet />
                </section>
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

function ItemList({ items }: { readonly items: Content[] }) {
    return (
        <ul>
            {items.map((x) => (
                <li key={x.id}>
                    <Link to={`/play/${x.id}?details=${x.id}`} state={{ autoplay: true }}>
                        [{x.genre}] {x.artist} - {x.title}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
