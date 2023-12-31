import type { LoaderFunctionArgs } from "@remix-run/server-runtime";
import { ContentId } from "soundscape-shared/src/content";
import Mime from "mime";
import { _let } from "soundscape-shared/src/utils";

export async function loader({ context, params }: LoaderFunctionArgs) {
    const id = new ContentId.External(Number(params["id"]));
    const info = await context.contentRepository.download(id);
    if (!info) throw new Response("not found", { status: 404 });

    const suffix = _let(Mime.getExtension(info.contentType), (x) => (x === null ? "" : `.${x}`));
    const filename = `${params["id"]} - ${info.artist} - ${info.title}${suffix}`;

    // @ts-ignore
    return new Response(info.stream, {
        headers: {
            "Content-Type": info.contentType,
            "Content-Disposition": `attachment;filename=${filename}`,
        },
    });
}
