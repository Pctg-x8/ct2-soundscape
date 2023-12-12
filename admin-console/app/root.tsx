import { cssBundleHref } from "@remix-run/css-bundle";
import type { LinksFunction } from "@remix-run/cloudflare";
import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "@remix-run/react";

import "./index.css";
import "./form.css";

export const links: LinksFunction = () => [
    { rel: "preconnect", href: "https://rsms.me/" },
    { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
    ...(cssBundleHref ? [{ rel: "stylesheet", href: cssBundleHref }] : []),
];

export default function App() {
    return (
        <html lang="ja">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <Meta />
                <Links />
            </head>
            <body>
                <nav>
                    <ul>
                        <li>
                            <Link to="/list">登録済み一覧</Link>
                        </li>
                        <li>
                            <Link to="/upload">ファイルアップロード</Link>
                        </li>
                    </ul>
                </nav>
                <Outlet />
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}
