export function badRequest(): Response {
    return new Response("", { status: 400 });
}

export function notFound(): Response {
    return new Response("", { status: 404 });
}
