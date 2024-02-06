import { type ActionFunctionArgs } from "@remix-run/server-runtime";
import { ContentId } from "soundscape-shared/src/content/id";

export async function action({ params, request, context }: ActionFunctionArgs) {
    const id = Number(params["id"]);
    if (!Number.isSafeInteger(id)) {
        throw new Response("invalid content id", { status: 400 });
    }
    const partNumber = Number(params["partNumber"]);
    if (!Number.isSafeInteger(partNumber)) {
        throw new Response("invalid part number", { status: 400 });
    }

    await context.contentRepository.uploadPart(new ContentId.External(id), partNumber, await request.arrayBuffer());
    return "";
}
