import { type ActionFunctionArgs, defer, type LoaderFunctionArgs, type MetaDescriptor } from "@remix-run/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { details } from "../../../../src/schema";
import { Await, useLoaderData } from "@remix-run/react";
import { Suspense } from "react";
import "./style.css";
import EntryTable from "./EntryTable";
import { eq } from "drizzle-orm";

export const meta: MetaDescriptor[] = [{ title: "Content List - Soundscape (Admin Console)" }];

export async function loader({ context }: LoaderFunctionArgs) {
    const items = drizzle(context.env.INFO_STORE).select().from(details).all();

    return defer({ items });
}

export async function action({ request, context }: ActionFunctionArgs) {
    const values = await request.formData();

    await context.env.OBJECT_STORE.delete(details.id.toString());
    await drizzle(context.env.INFO_STORE)
        .delete(details)
        .where(eq(details.id, Number(values.get("deleteAction"))))
        .execute();

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
