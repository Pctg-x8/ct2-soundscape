import { cssBundleHref } from "@remix-run/css-bundle";
import { defer, type HeadersArgs, type LinksFunction, type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Await, Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "@remix-run/react";
import { Suspense, useState } from "react";
import "./root.css";
import DetailsPane, { type Details } from "./components/DetailsPane";

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

    return defer({ items }, { headers: new Headers({ "Cache-Control": "max-age=3600, must-revalidate" }) });
}

export function headers({ loaderHeaders }: HeadersArgs) {
    return { "Cache-Control": loaderHeaders.get("Cache-Control") };
}

export default function App() {
    const { items } = useLoaderData<typeof loader>();

    const [details, setDetails] = useState<Promise<Details> | undefined>(undefined);
    const [showPane, setShowPane] = useState(false);

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
                            <Await resolve={items}>
                                {(items) => (
                                    <ItemList
                                        items={items}
                                        setDetails={(d) => {
                                            setDetails(d);
                                            setShowPane(true);
                                        }}
                                    />
                                )}
                            </Await>
                        </Suspense>
                        <DetailsPane show={showPane} data={details} onClose={() => setShowPane(false)} />
                    </section>
                    <Outlet />
                </section>
                <button type="button" id="ShowSidePaneButton" onClick={() => setShowPane(true)}>
                    <span className="material-symbols-outlined">menu</span>
                </button>
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

function ItemList({
    items,
    setDetails,
}: {
    readonly items: Content[];
    readonly setDetails: (details: Promise<Details>) => void;
}) {
    return (
        <ul>
            {items.map((x) => (
                <li key={x.id}>
                    <Link
                        to={`/play/${x.id}`}
                        state={{ autoplay: true }}
                        onClick={() => setDetails(fetch(`/content/${x.id}/details`).then((r) => r.json()))}
                    >
                        [{x.genre}] {x.artist} - {x.title}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
