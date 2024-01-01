import { cssBundleHref } from "@remix-run/css-bundle";
import { defer, type HeadersArgs, type LinksFunction, type LoaderFunctionArgs } from "@remix-run/cloudflare";
import {
    Await,
    Link,
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
    useLoaderData,
    useMatches,
} from "@remix-run/react";
import { Suspense, useState } from "react";
import "./root.css";
import DetailsPane, { type Details } from "./components/DetailsPane";
import { _let } from "soundscape-shared/src/utils";

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
    readonly year: number;
    readonly month: number;
    readonly day: number;
};

export function loader({ context, request }: LoaderFunctionArgs) {
    const items: Promise<Content[]> = context.contentRepository.allDetails.then((xs) =>
        xs.map((x) => ({
            id: x.id.value,
            title: x.title,
            artist: x.artist,
            genre: x.genre,
            year: x.dateJst.getFullYear(),
            month: x.dateJst.getMonth() + 1,
            day: x.dateJst.getDate(),
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
                        <section id="TopScrollContainer">
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
                        </section>
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
    const matches = useMatches();
    const currentPlayingID = _let(matches.find((m) => m.id === "routes/play.$id")?.params["id"], (id) =>
        id === undefined ? undefined : Number(id)
    );

    return (
        <ul id="ItemList">
            {items.map((x) => (
                <li key={x.id} className={currentPlayingID === x.id ? "active" : ""}>
                    <Link
                        to={`/play/${x.id}`}
                        state={{ autoplay: true }}
                        onClick={() => setDetails(fetch(`/content/${x.id}/details`).then((r) => r.json()))}
                    >
                        <span className="title">{x.title}</span>
                        <span className="genre">{x.genre}</span>
                        <span className="createdAt">
                            {x.year}/{x.month.toString().padStart(2, "0")}/{x.day.toString().padStart(2, "0")}
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
