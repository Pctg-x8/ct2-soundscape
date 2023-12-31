import { Form, useActionData, type MetaDescriptor, useNavigation } from "@remix-run/react";
import {
    unstable_createMemoryUploadHandler,
    type ActionFunctionArgs,
    unstable_parseMultipartFormData,
    json,
} from "@remix-run/cloudflare";
import { useRef, useState } from "react";
import { readFileMetadata } from "src/contentReader";
import { License } from "soundscape-shared/src/valueObjects/license";
import * as zfd from "zod-form-data";
import { pick } from "soundscape-shared/src/utils/typeImpl";
import * as z from "zod";

export const meta: MetaDescriptor[] = [{ title: "Uploader - Soundscape (Admin Console)" }];

export async function action({ request, context }: ActionFunctionArgs) {
    // TODO: 本来R2にはストリーミングputのAPIがあるんだけど、AsyncIterable->ReadableStreamの方法が存在しないので一旦メモリに貯める
    const body = await unstable_parseMultipartFormData(
        request,
        unstable_createMemoryUploadHandler({ maxPartSize: 100 * 1024 * 1024 })
    );

    const inputSchema = zfd.formData({
        title: zfd.text(),
        artist: zfd.text(),
        genre: zfd.text(),
        minBPM: zfd.numeric(),
        maxBPM: zfd.numeric(),
        comment: zfd.text(z.string().optional()).transform((x) => x ?? ""),
        time: zfd.text().transform((x) => new Date(x)),
        licenseType: zfd.numeric(),
        licenseText: zfd.text(z.string().optional()).transform((x) => x ?? ""),
        file: zfd.file(),
    });
    const input = inputSchema.parse(body);

    let license: License.Type;
    switch (input.licenseType) {
        case License.PublicDomain:
        case License.CreativeCommons4.BY:
        case License.CreativeCommons4.BY_SA:
        case License.CreativeCommons4.BY_NC:
        case License.CreativeCommons4.BY_ND:
        case License.CreativeCommons4.BY_NC_SA:
        case License.CreativeCommons4.BY_NC_ND:
            license = input.licenseType;
            break;
        case 999:
            license = input.licenseText;
            break;
        default:
            throw new Error("invalid license input");
    }

    const id = await context.contentRepository.add(
        {
            ...pick(input, "title", "artist", "genre", "comment"),
            bpmRange: { min: input.minBPM, max: input.maxBPM },
            dateJst: input.time,
            license,
        },
        input.file.type,
        input.file
    );

    return json({ success: id.value });
}

export default function Page() {
    const a = useActionData<typeof action>();
    const navigation = useNavigation();
    const isPending = navigation.state == "submitting";

    const [currentLicenseSelection, setCurrentLicenseSelection] = useState<number>(0);
    const form = useRef<HTMLFormElement>(null);
    const file = useRef<File | null>(null);
    const onAutoInputClicked = async () => {
        if (!file.current || !form.current) return;

        const formRef = form.current;
        const titleInput = formRef["title"] as unknown as HTMLInputElement,
            artistInput = formRef["artist"] as unknown as HTMLInputElement,
            genreInput = formRef["genre"] as unknown as HTMLInputElement,
            timeInput = formRef["time"] as unknown as HTMLInputElement;

        titleInput.value = "";
        artistInput.value = "";
        genreInput.value = "";

        await readFileMetadata(file.current, {
            onLastModifiedDate(d) {
                timeInput.value = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
                    .getDate()
                    .toString()
                    .padStart(2, "0")}`;
            },
            onTitle(value) {
                titleInput.value = value;
            },
            onArtist(value) {
                artistInput.value = value;
            },
            onGenre(value) {
                genreInput.value = value;
            },
        });
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
                            accept="audio/*"
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
                        <label htmlFor="licenseType">ライセンス形態</label>
                        <div className="licenseInputs">
                            <select
                                id="licenseType"
                                name="licenseType"
                                onChange={(e) => setCurrentLicenseSelection(Number(e.currentTarget.value))}
                            >
                                <option value={License.PublicDomain}>CC0</option>
                                <option value={License.CreativeCommons4.BY}>CC-BY</option>
                                <option value={License.CreativeCommons4.BY_SA}>CC-BY-SA</option>
                                <option value={License.CreativeCommons4.BY_NC}>CC-BY-NC</option>
                                <option value={License.CreativeCommons4.BY_NC_SA}>CC-BY-NC-SA</option>
                                <option value={License.CreativeCommons4.BY_NC_ND}>CC-BY-NC-ND</option>
                                <option value={License.CreativeCommons4.BY_ND}>CC-BY-ND</option>
                                <option value={999}>その他</option>
                            </select>
                            <input name="licenseText" disabled={currentLicenseSelection !== 999} />
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
