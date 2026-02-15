import { ContentId } from "soundscape-shared/src/content/id";
import { badRequest } from "soundscape-shared/src/utils/genericResponse";
import { createRepositoryAccess } from "src/repository";
import * as z from "zod";
import { type Route } from "./+types/route";

const ParamsSchema = z.object({
    id: ContentId.External.ZodPathParamSchema,
    partNumber: z
        .string()
        .regex(/^[0-9]+$/)
        .transform(Number),
});

export async function action({ params, request, context }: Route.ActionArgs) {
    const typedParams = ParamsSchema.safeParse(params);
    if (!typedParams.success) {
        console.error("invalid params", typedParams.error);
        throw badRequest();
    }

    await createRepositoryAccess(context.env, context.executionContext).uploadPart(
        typedParams.data.id,
        typedParams.data.partNumber,
        await request.arrayBuffer(),
    );

    return "";
}
