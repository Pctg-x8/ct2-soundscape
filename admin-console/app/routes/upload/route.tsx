import { Form, type MetaDescriptor } from "@remix-run/react";
import {
    unstable_createMemoryUploadHandler,
    type ActionFunctionArgs,
    unstable_parseMultipartFormData,
    unstable_composeUploadHandlers,
} from "@remix-run/cloudflare";
import "./style.css";

export const meta: MetaDescriptor[] = [{ title: "Uploader - Soundscape (Admin Console)" }];

export async function action({ request, context }: ActionFunctionArgs) {
    const handler = unstable_composeUploadHandlers(
        async (args) => {
            if (args.name !== "file") {
                // no file blob, skipping
                return undefined;
            }

            console.log("fileread", args);

            // TODO: 本来R2にはストリーミングputのAPIがあるんだけど、AsyncIterable->ReadableStreamの方法が存在しないので一旦メモリに貯める
            const blocks: Uint8Array[] = [];
            for await (const d of args.data) {
                blocks.push(d);
            }
            const data = new Uint8Array(blocks.reduce((a, b) => a + b.length, 0));
            let offset = 0;
            for (const b of blocks) {
                data.set(b, offset);
                offset += b.length;
            }

            await context.env.OBJECT_STORE.put("test", data);
        },
        unstable_createMemoryUploadHandler({ maxFileSize: 100 * 1024 * 1024 })
    );
    const body = await unstable_parseMultipartFormData(request, handler);
    console.log("Insert body", body);

    return "ok";
}

export default function Page() {
    return (
        <article id="UploadForm">
            <h1>ファイルアップロード</h1>
            <Form method="post" encType="multipart/form-data">
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
            </Form>
        </article>
    );
}
