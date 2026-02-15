import { ContentId } from "soundscape-shared/src/content/id";
import { badRequest } from "soundscape-shared/src/utils/genericResponse";
import { pick } from "soundscape-shared/src/utils/typeImpl";
import { convertLicenseInput } from "src/conversion";
import { createRepositoryAccess } from "src/repository";
import * as z from "zod";
import { type Route } from "./+types/route";

const AddedContentDetailsSchema = z.object({
    title: z.string(),
    artist: z.string(),
    genre: z.string(),
    year: z.number(),
    month: z.number(),
    day: z.number(),
    minBPM: z.number(),
    maxBPM: z.number(),
    comment: z.string(),
    licenseType: z.number(),
    licenseText: z
        .string()
        .optional()
        .transform(x => x ?? ""),
});
export type CompleteBodyData = Readonly<z.infer<typeof AddedContentDetailsSchema>>;

const ParamsSchema = z.object({ id: ContentId.External.ZodPathParamSchema });

export async function action({ params, context, request }: Route.ActionArgs) {
    const typedParams = ParamsSchema.safeParse(params);
    if (!typedParams.success) {
        console.error("invalid params", typedParams.error);
        throw badRequest();
    }

    const details = AddedContentDetailsSchema.safeParse(await request.json());
    if (!details.success) {
        console.error("invalid body", details.error);
        throw badRequest();
    }

    await createRepositoryAccess(context.env, context.executionContext).completeMultipartUploading(
        typedParams.data.id,
        {
            ...pick(details.data, "title", "artist", "genre", "comment"),
            bpmRange: { min: details.data.minBPM, max: details.data.maxBPM },
            dateJst: new Date(details.data.year, details.data.month - 1, details.data.day),
            license: convertLicenseInput(details.data),
        },
    );

    return "";
}
