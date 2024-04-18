import { json, type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { createRepositoryAccess } from "src/repository";

export async function loader({ context, params }: LoaderFunctionArgs) {
    return json(
        await createRepositoryAccess(context.env, context.executionContext)
            .getDetailsByYear(Number(params["year"]))
            .then((xs) =>
                xs.map((x) => ({
                    id: x.id.value,
                    title: x.title,
                    artist: x.artist,
                    genre: x.genre,
                    year: x.dateJst.getFullYear(),
                    month: x.dateJst.getMonth() + 1,
                    day: x.dateJst.getDate(),
                }))
            ),
        { headers: { "Cache-Control": "max-age=60, must-revalidate" } }
    );
}
