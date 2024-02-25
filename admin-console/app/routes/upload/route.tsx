import { Form, type MetaDescriptor } from "@remix-run/react";
import { type FormEvent, useRef, useState } from "react";
import { readFileMetadata } from "src/contentReader";
import { License } from "soundscape-shared/src/valueObjects/license";
import * as zfd from "zod-form-data";
import { pick } from "soundscape-shared/src/utils/typeImpl";
import * as z from "zod";
import { ReturnSchema } from "../cmd.upload.begin/route";
import { type CompleteBodyData } from "../cmd.upload.$id.complete/route";

export const meta: MetaDescriptor[] = [{ title: "Uploader - Soundscape (Admin Console)" }];

type SubmitState =
    | undefined
    | { readonly state: "Pending"; readonly sentBytes: number; readonly totalBytes: number }
    | { readonly state: "Success"; readonly id: number }
    | { readonly state: "Failed" };

const FormDataSchema = zfd.formData({
    title: zfd.text(),
    artist: zfd.text(),
    genre: zfd.text(),
    minBPM: zfd.numeric(),
    maxBPM: zfd.numeric(),
    comment: zfd.text(z.string().optional()).transform((x) => x ?? ""),
    time: zfd.text().transform((x) => new Date(x)),
    licenseType: zfd.numeric(),
    licenseText: zfd.text(z.string().optional()).transform((x) => x ?? ""),
});

class PendingUpload {
    static async begin(contentType: string): Promise<PendingUpload> {
        const r = await fetch("/cmd/upload/begin", { method: "POST", headers: { "content-type": contentType } });
        if (!r.ok) throw new Error(r.statusText);

        const { id } = ReturnSchema.parse(await r.json());

        return new PendingUpload(id);
    }

    constructor(private readonly tempId: number) {}

    async uploadPart(partNumber: number, data: Blob): Promise<void> {
        const r = await fetch(`/cmd/upload/${this.tempId}/${partNumber}`, { method: "POST", body: data });
        if (!r.ok) throw new Error(r.statusText);
    }

    async complete(details: CompleteBodyData): Promise<number> {
        const r = await fetch(`/cmd/upload/${this.tempId}/complete`, { method: "POST", body: JSON.stringify(details) });
        if (!r.ok) throw new Error(r.statusText);

        return this.tempId;
    }
}

async function uploadMultiparted(
    content: Blob,
    details: z.infer<typeof FormDataSchema>,
    progress: (sentBytes: number) => void
): Promise<number> {
    const PART_SIZE = 8 * 1024 * 1024;

    progress(0);
    const tempContent = await PendingUpload.begin(content.type);

    let partNumber = 0;
    while (partNumber * PART_SIZE < content.size) {
        const part = content.slice(partNumber * PART_SIZE, (partNumber + 1) * PART_SIZE);
        const op = tempContent.uploadPart(partNumber + 1, part);
        progress(partNumber * PART_SIZE);
        await op;
        partNumber++;
    }

    const leftSize = content.size - partNumber * PART_SIZE;
    const finalOp =
        leftSize > 0
            ? tempContent.uploadPart(partNumber + 1, content.slice(partNumber * PART_SIZE, content.size))
            : Promise.resolve();
    progress(content.size);
    await finalOp;

    return await tempContent.complete({
        ...pick(details, "title", "artist", "genre", "minBPM", "maxBPM", "comment", "licenseType", "licenseText"),
        year: details.time.getFullYear(),
        month: details.time.getMonth() + 1,
        day: details.time.getDate(),
    });
}

export async function guard(observer: (loading: boolean) => void, op: Promise<void>) {
    observer(true);
    await op.finally(() => observer(false));
}

export default function Page() {
    const [result, setResult] = useState<SubmitState>(undefined);
    const [isPending, setIsPending] = useState(false);

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

        await guard(
            setIsPending,
            readFileMetadata(file.current, {
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
            })
        );
    };

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();

        const data = new FormData(e.target as HTMLFormElement);
        const file = data.get("file") as File;
        if (!file) {
            throw new Error("File is empty");
        }

        await guard(
            setIsPending,
            uploadMultiparted(file, FormDataSchema.parse(data), (sentBytes) => {
                setResult({ state: "Pending", sentBytes, totalBytes: file.size });
                console.log("sentBytes", sentBytes, file.size);
            }).then(
                (id) => {
                    setResult({ state: "Success", id });
                },
                (e) => {
                    console.error(e);
                    setResult({ state: "Failed" });
                }
            )
        );
    };

    return (
        <article id="UploadForm">
            <h1>ファイルアップロード</h1>
            <Form
                method="post"
                encType="multipart/form-data"
                replace
                className="contentForm"
                ref={form}
                onSubmit={onSubmit}
            >
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
                {result ? <SubmitStatePopover state={result} /> : undefined}
            </Form>
        </article>
    );
}

function SubmitStatePopover({ state }: { readonly state: NonNullable<SubmitState> }) {
    switch (state.state) {
        case "Pending":
            return (
                <article className="successPopover">
                    Uploading {displayPercent(state.sentBytes, state.totalBytes)} ({state.sentBytes} /{" "}
                    {state.totalBytes})...
                </article>
            );
        case "Success":
            return <article className="successPopover">#{state.id} successfully added</article>;
        case "Failed":
            return <article className="successPopover">uploading failed</article>;
    }
}

function displayPercent(current: number, total: number): string {
    return ((100 * current) / total).toFixed(2) + "%";
}
