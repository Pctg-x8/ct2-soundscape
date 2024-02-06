import { type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { ContentId } from "soundscape-shared/src/content/id";
import * as z from "zod";

const UploadPartSchema = z.object({
    part_number: z.number(),
    etag: z.string(),
});

export async function loader({ params, context, request }: LoaderFunctionArgs) {
    const id = Number(params["id"]);
    if (!Number.isSafeInteger(id)) {
        throw new Response("invalid content id", { status: 400 });
    }

    const parts = z.array(UploadPartSchema).parse(await request.json());

    // TODO: 本来はawait usingを使いたい remixがなんか対応してないらしい？？
    const r = await context.contentRepository.completeMultipartUploading(
        new ContentId.External(id),
        parts.map((p) => ({ partNumber: p.part_number, etag: p.etag }))
    );
    r.neutralize();
}
