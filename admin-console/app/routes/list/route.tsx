import { type ActionFunctionArgs, defer, type LoaderFunctionArgs, type MetaDescriptor } from "@remix-run/cloudflare";
import { Await, type ShouldRevalidateFunctionArgs, useLoaderData } from "@remix-run/react";
import { Suspense } from "react";
import "./style.css";
import EntryTable, { type EntryTableRow } from "./EntryTable";
import { CloudflareContentRepository } from "soundscape-shared/src/content";

export const meta: MetaDescriptor[] = [{ title: "Content List - Soundscape (Admin Console)" }];

export async function loader({ context }: LoaderFunctionArgs) {
    const contentRepo = new CloudflareContentRepository(context.env.INFO_STORE, context.env.OBJECT_STORE);

    const items: Promise<EntryTableRow[]> = contentRepo.allDetails.then((xs) =>
        xs.map((x) => ({
            id: x.id,
            title: x.title,
            year: x.dateJst.getFullYear(),
            // Note: returned as 0-based(Jan = 0)
            month: x.dateJst.getMonth() + 1,
            day: x.dateJst.getDate(),
            downloadAllowed: x.flags.downloadAllowed,
        }))
    );

    return defer({ items });
}

export async function action({ request, context }: ActionFunctionArgs) {
    const values = await request.formData();

    await new CloudflareContentRepository(context.env.INFO_STORE, context.env.OBJECT_STORE).delete(
        Number(values.get("deleteAction"))
    );

    return true;
}

export function shouldRevalidate({ actionResult, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
    return actionResult ? true : defaultShouldRevalidate;
}

export default function Page() {
    const { items } = useLoaderData<typeof loader>();

    return (
        <article>
            <h1>登録済み一覧</h1>
            <Suspense fallback={<p>Loading...</p>}>
                <Await resolve={items}>{(items) => <EntryTable initItems={items} />}</Await>
            </Suspense>
        </article>
    );
}
