export function notFound(): Response {
    return new Response("", { status: 404 });
}
