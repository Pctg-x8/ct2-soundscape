import { index, prefix, route, type RouteConfig } from "@react-router/dev/routes";

export default [
    index("routes/_index.tsx"),
    route("list", "routes/list/route.tsx"),
    route("upload", "routes/upload/route.tsx"),
    route("multiupload", "routes/multiupload/route.tsx"),
    ...prefix("cmd/upload", [
        route("begin", "routes/cmd.upload.begin/route.ts"),
        route(":id/:partNumber", "routes/cmd.upload.$id.$partNumber/route.tsx"),
        route(":id/complete", "routes/cmd.upload.$id.complete/route.ts"),
    ]),
] satisfies RouteConfig;
