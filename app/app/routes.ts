import { index, prefix, route, type RouteConfig } from "@react-router/dev/routes";

export default [
    index("./routes/index.tsx"),
    route("play/:id", "./routes/play.tsx"),
    route("search/by-year/:year", "./routes/searchByYear.tsx"),
    ...prefix("content/:id", [
        route("details", "./routes/contentDetails.tsx"),
        route("download", "./routes/contentDownload.tsx"),
    ]),
] satisfies RouteConfig;
