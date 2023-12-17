import { cssBundleHref } from "@remix-run/css-bundle";
import { defer, type LinksFunction, type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Await, Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "@remix-run/react";
import { Suspense } from "react";
import "./root.css";

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

export function loader({ context }: LoaderFunctionArgs) {
    const items: Promise<Content[]> = context.contentRepository.allDetails.then((xs) =>
        xs.map((x) => ({
            id: x.id.value,
            title: x.title,
            artist: x.artist,
            genre: x.genre,
        }))
    );

    return defer({ items });
}

export default function App() {
    const { items } = useLoaderData<typeof loader>();

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <Meta />
                <Links />
            </head>
            <body>
                <Suspense fallback={<p>Loading...</p>}>
                    <Await resolve={items}>{(items) => <ItemList items={items} />}</Await>
                </Suspense>
                <Outlet />
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
                    <Link to={`/play/${x.id}`} state={{ autoplay: true }}>
                        [{x.genre}] {x.artist} - {x.title}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
