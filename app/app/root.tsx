import { Suspense, useCallback, useMemo, useReducer, useState } from "react";
import { Await, data, Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useMatches } from "react-router";
import { _let } from "soundscape-shared/src/utils";
import { createRepositoryAccess } from "src/repository";
import { type Route } from "./+types/root";
import DetailsPane, { type Details } from "./components/DetailsPane";
import "./root.css";

export type Content = {
    readonly id: number;
    readonly title: string;
    readonly artist: string;
    readonly genre: string;
    readonly year: number;
    readonly month: number;
    readonly day: number;
};

export async function loader({ context }: Route.LoaderArgs) {
    const years = await createRepositoryAccess(context.env, context.ctx).yearWithContentCount;
    return data({ years }, { headers: new Headers({ "Cache-Control": "max-age=3600, must-revalidate" }) });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
    return { "Cache-Control": loaderHeaders.get("Cache-Control") };
}

type ContentGroupState = { [year in number]?: { readonly opened: boolean; readonly contents?: Promise<Content[]> } };
type ContentGroupAction =
    | { readonly type: "toggle"; readonly groupKey: number }
    | { readonly type: "openForContent"; readonly content: Content };
function updateContentGroupState(current: ContentGroupState, action: ContentGroupAction): ContentGroupState {
    async function loadGroupContent(groupKey: number): Promise<Content[]> {
        const contents = await fetch(`/search/by-year/${groupKey}`).then(r => r.json<Content[]>());
        contents.sort((a, b) => contentCreatedAtSortKey(a) - contentCreatedAtSortKey(b));

        // store stalling cache
        cachedItems[groupKey] = contents;
        return contents;
    }

    if (action.type === "toggle") {
        const opened = current[action.groupKey]?.opened ?? false;
        return opened
            ? { ...current, [action.groupKey]: { ...(current[action.groupKey] ?? {}), opened: false } }
            : {
                  ...current,
                  [action.groupKey]: {
                      opened: true,
                      contents: loadGroupContent(action.groupKey),
                  },
              };
    }

    if (action.type === "openForContent") {
        if (current[action.content.year]?.opened ?? false) {
            // すでに開いていたらなにもしない
            return current;
        }

        return {
            ...current,
            [action.content.year]: {
                opened: true,
                contents: loadGroupContent(action.content.year),
            },
        };
    }

    throw new Error("unreachable");
}

function contentCreatedAtSortKey(c: Content): number {
    return c.year * 10000 + c.month * 100 + c.day;
}

export default function App({ loaderData: { years } }: Route.ComponentProps) {
    const [details, setDetails] = useState<Promise<Details> | undefined>(undefined);
    const [showPane, setShowPane] = useState(false);
    const [contentGroups, dispatchContentGroupAction] = useReducer(updateContentGroupState, {});
    const toggleListGroup = useCallback(
        (groupKey: number) => dispatchContentGroupAction({ type: "toggle", groupKey }),
        [dispatchContentGroupAction],
    );
    const openDetails = useCallback(
        (content: Promise<Details>) => {
            setDetails(content);
            setShowPane(true);
        },
        [setDetails, setShowPane],
    );

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,1,0"
                />
                <Meta />
                <Links />
            </head>
            <body>
                <section id="MainLayout">
                    <section id="Top">
                        <section id="TopScrollContainer">
                            <ItemList
                                years={years}
                                contentGroups={contentGroups}
                                onClickGroup={toggleListGroup}
                                setDetails={openDetails}
                            />
                        </section>
                        <DetailsPane show={showPane} data={details} onClose={() => setShowPane(false)} />
                    </section>
                    <Outlet
                        context={{
                            openGroupForContent: (c: Content) =>
                                dispatchContentGroupAction({ type: "openForContent", content: c }),
                        }}
                    />
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

const cachedItems: { [year in number]?: Content[] } = {};

function Item({
    content,
    active = false,
    onClick,
}: {
    readonly content: Content;
    readonly active?: boolean;
    readonly onClick: (content: Content) => void;
}) {
    return (
        <li className={active ? "active" : ""}>
            <Link to={`/play/${content.id}`} state={{ autoplay: true }} onClick={() => onClick(content)}>
                <span className="title">{content.title}</span>
                <span className="genre">{content.genre}</span>
                <span className="createdAt">
                    {content.year}/{content.month.toString().padStart(2, "0")}/{content.day.toString().padStart(2, "0")}
                </span>
            </Link>
        </li>
    );
}

function ItemList({
    years,
    contentGroups,
    onClickGroup,
    setDetails,
}: {
    readonly years: [number, number][];
    readonly contentGroups: ContentGroupState;
    readonly onClickGroup: (groupKey: number) => void;
    readonly setDetails: (details: Promise<Details>) => void;
}) {
    const sortedYears = useMemo(() => years.sort((a, b) => a[0] - b[0]), [years]);

    const matches = useMatches();
    const currentPlayingID = _let(matches.find(m => m.id === "routes/play")?.params["id"], id =>
        id === undefined ? undefined : Number(id),
    );

    return (
        <ul id="ItemList">
            {sortedYears.map(([y, count]) => (
                <li key={y}>
                    <div className="labelContainer" onClick={() => onClickGroup(y)}>
                        <span className="groupingValue">{y}</span>
                        <span className="containedCount">{count} items</span>
                    </div>
                    {(contentGroups[y]?.opened ?? false) ? (
                        <ul>
                            <Suspense
                                fallback={
                                    y in cachedItems
                                        ? cachedItems[y]!.map(x => (
                                              <Item
                                                  key={x.id}
                                                  content={x}
                                                  active={currentPlayingID === x.id}
                                                  onClick={c =>
                                                      setDetails(fetch(`/content/${c.id}/details`).then(r => r.json()))
                                                  }
                                              />
                                          ))
                                        : [<li key="Loading">Loading...</li>]
                                }
                            >
                                <Await resolve={contentGroups[y]?.contents ?? Promise.resolve([])}>
                                    {content =>
                                        content.map(x => (
                                            <Item
                                                key={x.id}
                                                content={x}
                                                active={currentPlayingID === x.id}
                                                onClick={c =>
                                                    setDetails(fetch(`/content/${c.id}/details`).then(r => r.json()))
                                                }
                                            />
                                        ))
                                    }
                                </Await>
                            </Suspense>
                        </ul>
                    ) : undefined}
                </li>
            ))}
        </ul>
    );
}
