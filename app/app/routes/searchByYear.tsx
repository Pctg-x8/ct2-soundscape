import { notFound } from "soundscape-shared/src/utils/genericResponse";
import { pick } from "soundscape-shared/src/utils/typeImpl";
import { createRepositoryAccess } from "src/repository";
import * as z from "zod";
import { type Route } from "./+types/searchByYear";

const ParamsSchema = z.object({
    year: z
        .string()
        .regex(/^[0-9]$/)
        .transform(Number),
});

export async function loader({ context, params }: Route.LoaderArgs) {
    const paramsTyped = ParamsSchema.safeParse(params);
    if (!paramsTyped.success) {
        console.error("invalid params", paramsTyped.error);
        throw notFound();
    }

    const records = await createRepositoryAccess(context.env, context.ctx).getDetailsByYear(paramsTyped.data.year);

    return Response.json(
        records.map(x => ({
            id: x.id.value,
            ...pick(x, "title", "artist", "genre"),
            year: x.dateJst.getFullYear(),
            month: x.dateJst.getMonth() + 1,
            day: x.dateJst.getDate(),
        })),
        { headers: { "Cache-Control": "max-age=60, must-revalidate" } },
    );
}
