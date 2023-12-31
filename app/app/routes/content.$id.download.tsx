import type { LoaderFunctionArgs } from "@remix-run/server-runtime";
import { ContentId } from "soundscape-shared/src/content";
import Mime from "mime";
import { _let } from "soundscape-shared/src/utils";

function getExtension(contentType: string): string | null {
    // Note: mimeだとaudio/mpegがmpgaとかいう謎の拡張子になるので例外対応する
    const knownExtensionTable: Record<string, string> = {
        "audio/mpeg": "mp3",
    };
    if (contentType in knownExtensionTable) return knownExtensionTable[contentType];

    return Mime.getExtension(contentType);
}

export async function loader({ context, params }: LoaderFunctionArgs) {
    const id = new ContentId.External(Number(params["id"]));
    const info = await context.contentRepository.download(id);
    if (!info) throw new Response("not found", { status: 404 });

    const suffix = _let(getExtension(info.contentType), (x) => (x === null ? "" : `.${x}`));
    const filename = `${params["id"]} - ${info.artist} - ${info.title}${suffix}`;

    // @ts-ignore
    return new Response(info.stream, {
        headers: {
            "Content-Type": info.contentType,
            "Content-Disposition": `attachment;filename=${filename}`,
        },
    });
}
