import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import "./form.css";
import "./index.css";

export default function App() {
    return (
        <html lang="ja">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="preconnect" href="https://rsms.me/" />
                <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
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
                        <li>
                            <Link to="/multiupload">複数ファイルアップロード</Link>
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
