import { type ActionFunctionArgs, defer, type LoaderFunctionArgs, type MetaDescriptor } from "@remix-run/cloudflare";
import { Await, useLoaderData } from "@remix-run/react";
import { Suspense } from "react";
import "./style.css";
import EntryTable from "./EntryTable";
import { CloudflareContentRepository } from "soundscape-shared/src/content";

export const meta: MetaDescriptor[] = [{ title: "Content List - Soundscape (Admin Console)" }];

export async function loader({ context }: LoaderFunctionArgs) {
    const items = new CloudflareContentRepository(context.env.INFO_STORE, context.env.OBJECT_STORE).allDetails;

    return defer({ items });
}

export async function action({ request, context }: ActionFunctionArgs) {
    const values = await request.formData();

    await new CloudflareContentRepository(context.env.INFO_STORE, context.env.OBJECT_STORE).delete(
        Number(values.get("deleteAction"))
    );

    return null;
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
