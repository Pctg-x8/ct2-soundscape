import { badRequest } from "soundscape-shared/src/utils/genericResponse";
import { createRepositoryAccess } from "src/repository";
import * as z from "zod";
import { type Route } from "./+types/route";

export const ReturnSchema = z.object({ id: z.int() });

export async function action({ context, request }: Route.ActionArgs) {
    const contentType = request.headers.get("content-type");
    if (!contentType) {
        console.error("missing content-type");
        throw badRequest();
    }

    const id = await createRepositoryAccess(context.env, context.executionContext).beginMultipartUploading(contentType);

    return Response.json({ id: id.value });
}
