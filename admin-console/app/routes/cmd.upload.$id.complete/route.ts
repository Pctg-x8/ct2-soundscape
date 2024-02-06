import { type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { ContentId } from "soundscape-shared/src/content/id";
import { convertLicenseInput } from "src/conversion";
import * as z from "zod";
import { pick } from "soundscape-shared/src/utils/typeImpl";

const UploadPartSchema = z.object({
    part_number: z.number(),
    etag: z.string(),
});
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

export async function loader({ params, context, request }: LoaderFunctionArgs) {
    const id = Number(params["id"]);
    if (!Number.isSafeInteger(id)) {
        throw new Response("invalid content id", { status: 400 });
    }

    const { parts, details } = z
        .object({ parts: z.array(UploadPartSchema), details: AddedContentDetailsSchema })
        .parse(await request.json());
    const license = convertLicenseInput(details);

    // TODO: 本来はawait usingを使いたい remixがなんか対応してないらしい？？
    const r = await context.contentRepository.completeMultipartUploading(
        new ContentId.External(id),
        {
            ...pick(details, "title", "artist", "genre", "comment"),
            bpmRange: { min: details.minBPM, max: details.maxBPM },
            dateJst: new Date(details.year, details.month, details.day),
            license,
        },
        parts.map((p) => ({ partNumber: p.part_number, etag: p.etag }))
    );
    r.neutralize();
}
