import { json, type ActionFunctionArgs } from "@remix-run/server-runtime";
import * as z from "zod";

export const ReturnSchema = z.object({ id: z.number() });

export async function action({ context, request }: ActionFunctionArgs) {
    const contentType = request.headers.get("content-type");
    if (!contentType) {
        throw new Response("content-type is mandatory", { status: 400 });
    }

    // TODO: 本来はawait usingを使いたい remixがなんか対応してないらしい？？
    const upload = await context.contentRepository.beginMultipartUploading(contentType);
    upload.neutralize();

    return json({ id: upload.value.value });
}
