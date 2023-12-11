import { Form, useActionData, type MetaDescriptor, useNavigation } from "@remix-run/react";
import {
    unstable_createMemoryUploadHandler,
    type ActionFunctionArgs,
    unstable_parseMultipartFormData,
    json,
} from "@remix-run/cloudflare";
import "./style.css";
import { drizzle } from "drizzle-orm/d1";
import { details } from "../../../../src/schema";
// import mime from "mime-types";

export const meta: MetaDescriptor[] = [{ title: "Uploader - Soundscape (Admin Console)" }];

export async function action({ request, context: { env } }: ActionFunctionArgs) {
    // TODO: 本来R2にはストリーミングputのAPIがあるんだけど、AsyncIterable->ReadableStreamの方法が存在しないので一旦メモリに貯める
    const body = await unstable_parseMultipartFormData(
        request,
        unstable_createMemoryUploadHandler({ maxPartSize: 100 * 1024 * 1024 })
    );
    const file = body.get("file")! as File;
    // const fileExt = mime.extension(file.type);

    // TODO: ファイルアップロードに失敗したらレコード消す
    const [inserted] = await drizzle(env.INFO_STORE)
        .insert(details)
        .values([
            {
                title: String(body.get("title")),
                dateJst: new Date(String(body.get("time"))),
                comment: String(body.get("comment")),
            },
        ])
        .returning({ id: details.id })
        .execute();
    await env.OBJECT_STORE.put(inserted.id.toString(), file);

    return json({ success: inserted.id });
}

export default function Page() {
    const a = useActionData<typeof action>();
    const navigation = useNavigation();
    const isPending = navigation.formAction == "/upload";

    return (
        <article id="UploadForm">
            <h1>ファイルアップロード</h1>
            <Form method="post" encType="multipart/form-data">
                <fieldset disabled={isPending}>
                    <section>
                        <label htmlFor="title">タイトル</label>
                        <input id="title" name="title" required />
                    </section>
                    <section>
                        <label htmlFor="time">制作日</label>
                        <input id="time" name="time" type="date" required />
                    </section>
                    <section>
                        <label htmlFor="comment">コメント（Markdown可）</label>
                        <textarea id="comment" name="comment" rows={1} />
                    </section>
                    <section>
                        <label htmlFor="file">ファイル</label>
                        <input id="file" name="file" type="file" required />
                    </section>
                    <section>
                        <p className="labelLike">オプション</p>
                        <div>
                            <input id="enableDownloads" name="enableDownloads" type="checkbox" />
                            <label htmlFor="enableDownloads">ダウンロード許可</label>
                        </div>
                    </section>
                    <section className="buttons">
                        <button type="submit" className="positive">
                            追加
                        </button>
                        <button type="reset" className="negative">
                            入力内容をリセット
                        </button>
                    </section>
                </fieldset>
                {a?.success ? <article className="successPopover">#{a.success} successfully added</article> : undefined}
            </Form>
        </article>
    );
}
