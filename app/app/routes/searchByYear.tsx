import { data } from "react-router";
import { createRepositoryAccess } from "src/repository";
import { type Route } from "./+types/search.by-year.$year";

export async function loader({ context, params }: Route.LoaderArgs) {
    return data(
        await createRepositoryAccess(context.env, context.ctx)
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
