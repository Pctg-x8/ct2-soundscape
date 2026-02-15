import Mime from "mime";
import { ContentId } from "soundscape-shared/src/content/id";
import { _let } from "soundscape-shared/src/utils";
import { notFound } from "soundscape-shared/src/utils/genericResponse";
import { createRepositoryAccess } from "src/repository";
import * as z from "zod";
import { type Route } from "./+types/contentDownload";

const ParamsSchema = z.object({ id: ContentId.External.ZodPathParamSchema });

export async function loader({ context, params }: Route.LoaderArgs) {
    const paramsTyped = ParamsSchema.safeParse(params);
    if (!paramsTyped.success) {
        console.error("invalid params", paramsTyped.error);
        throw notFound();
    }

    const info = await createRepositoryAccess(context.env, context.ctx).download(paramsTyped.data.id);
    if (!info) {
        throw notFound();
    }

    const suffix = _let(getExtension(info.contentType), x => (x === null ? "" : `.${x}`));
    const filename = `${paramsTyped.data.id.value} - ${info.artist} - ${info.title}${suffix}`;

    // @ts-ignore
    return new Response(info.stream, {
        headers: {
            "Content-Type": info.contentType,
            "Content-Disposition": `attachment;filename=${filename}`,
        },
    });
}

function getExtension(contentType: string): string | null {
    // Note: mimeだとaudio/mpegがmpgaとかいう謎の拡張子になるので例外対応する
    const knownExtensionTable: Record<string, string> = {
        "audio/mpeg": "mp3",
    };

    return contentType in knownExtensionTable ? knownExtensionTable[contentType] : Mime.getExtension(contentType);
}
