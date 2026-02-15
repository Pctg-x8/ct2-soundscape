import { createRepositoryAccess } from "src/repository";
import * as z from "zod";
import { type Route } from "./+types/route";

export const ReturnSchema = z.object({ id: z.number() });

export async function action({ context, request }: Route.ActionArgs) {
    const contentType = request.headers.get("content-type");
    if (!contentType) {
        throw new Response("content-type is mandatory", { status: 400 });
    }

    // TODO: 本来はawait usingを使いたい remixがなんか対応してないらしい？？
    const upload = await createRepositoryAccess(context.env, context.executionContext).beginMultipartUploading(
        contentType
    );
    upload.neutralize();

    return Response.json({ id: upload.value.value });
}
