import { Form, useActionData, type MetaDescriptor, useNavigation } from "@remix-run/react";
import {
    unstable_createMemoryUploadHandler,
    type ActionFunctionArgs,
    unstable_parseMultipartFormData,
    json,
} from "@remix-run/cloudflare";
import { ContentFlags } from "soundscape-shared/src/schema";
import { useRef, useState } from "react";
import { RIFFChunk, isRIFFWave, readRIFFFileHeader } from "src/riffReader";

export const meta: MetaDescriptor[] = [{ title: "Uploader - Soundscape (Admin Console)" }];

export async function action({ request, context }: ActionFunctionArgs) {
    // TODO: 本来R2にはストリーミングputのAPIがあるんだけど、AsyncIterable->ReadableStreamの方法が存在しないので一旦メモリに貯める
    const body = await unstable_parseMultipartFormData(
        request,
        unstable_createMemoryUploadHandler({ maxPartSize: 100 * 1024 * 1024 })
    );
    const file = body.get("file")! as File;

    const id = await context.contentRepository.add(
        {
            title: String(body.get("title")),
            artist: String(body.get("artist")),
            genre: String(body.get("genre")),
            bpmRange: { min: Number(body.get("minBPM")), max: Number(body.get("maxBPM")) },
            comment: String(body.get("comment")),
            dateJst: new Date(String(body.get("time"))),
            flags: ContentFlags.fromBooleans({
                allowDownload: body.get("enableDownloads") === "on",
            }),
        },
        file
    );

    return json({ success: id.value });
}

export default function Page() {
    const a = useActionData<typeof action>();
    const navigation = useNavigation();
    const isPending = navigation.state == "submitting";

    const form = useRef<HTMLFormElement>(null);
    const file = useRef<File | null>(null);
    const onAutoInputClicked = async () => {
        if (!file.current || !form.current) return;

        const formRef = form.current;

        console.log(file.current);
        const lastModifiedDate = new Date(file.current.lastModified);
        formRef["time"].value = `${lastModifiedDate.getFullYear()}-${
            lastModifiedDate.getMonth() + 1
        }-${lastModifiedDate.getDate()}`;

        const content = await file.current.arrayBuffer();
        if (isRIFFWave(new DataView(content, 0))) {
            RIFFChunk.readAll(new DataView(content, 12), {
                onUnknown(c) {
                    // console.log("unknown chunk", c.id);
                },
                onList(c) {
                    const infoList = c.tryConvertToInfoList();
                    if (!infoList) return;

                    infoList.readAllEntries({
                        onName(value) {
                            (formRef["title"] as unknown as HTMLInputElement).value = value;
                        },
                        onGenre(value) {
                            (formRef["genre"] as unknown as HTMLInputElement).value = value;
                        },
                        onArtist(value) {
                            (formRef["artist"] as unknown as HTMLInputElement).value = value;
                        },
                    });
                },
            });
        }
    };

    return (
        <article id="UploadForm">
            <h1>ファイルアップロード</h1>
            <Form method="post" encType="multipart/form-data" replace className="contentForm" ref={form}>
                <fieldset disabled={isPending}>
                    <section>
                        <label htmlFor="title">タイトル</label>
                        <input id="title" name="title" required />
                    </section>
                    <section>
                        <label htmlFor="artist">アーティスト表記名</label>
                        <input id="artist" name="artist" required />
                    </section>
                    <section>
                        <label htmlFor="genre">ジャンル</label>
                        <input id="genre" name="genre" required />
                    </section>
                    <section>
                        <p className="labelLike">BPM範囲</p>
                        <section className="inputGroup">
                            <input
                                name="minBPM"
                                type="number"
                                defaultValue={120}
                                min={1}
                                className="bpmInputBox"
                                required
                            />
                            〜
                            <input
                                name="maxBPM"
                                type="number"
                                defaultValue={120}
                                min={1}
                                className="bpmInputBox"
                                required
                            />
                        </section>
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
                        <input
                            id="file"
                            name="file"
                            type="file"
                            required
                            onChange={(e) => {
                                file.current = e.currentTarget.files?.item(0) ?? null;
                            }}
                        />
                        <button type="button" onClick={onAutoInputClicked}>
                            ファイルから自動入力
                        </button>
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
