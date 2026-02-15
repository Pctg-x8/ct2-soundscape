import { ContentId } from "soundscape-shared/src/content/id";
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
        .transform((x) => x ?? ""),
});
export type CompleteBodyData = Readonly<z.infer<typeof AddedContentDetailsSchema>>;

export async function action({ params, context, request }: Route.ActionArgs) {
    const id = Number(params["id"]);
    if (!Number.isSafeInteger(id)) {
        throw new Response("invalid content id", { status: 400 });
    }

    const details = AddedContentDetailsSchema.parse(await request.json());
    const license = convertLicenseInput(details);

    // TODO: 本来はawait usingを使いたい remixがなんか対応してないらしい？？
    const r = await createRepositoryAccess(context.env, context.executionContext).completeMultipartUploading(
        new ContentId.External(id),
        {
            ...pick(details, "title", "artist", "genre", "comment"),
            bpmRange: { min: details.minBPM, max: details.maxBPM },
            dateJst: new Date(details.year, details.month, details.day),
            license,
        }
    );
    r.neutralize();

    return "";
}
