import {
    type ActionFunctionArgs,
    defer,
    type LoaderFunctionArgs,
    type MetaDescriptor,
    json,
} from "@remix-run/cloudflare";
import {
    Await,
    type ShouldRevalidateFunctionArgs,
    useLoaderData,
    useFetcher,
    type FetcherWithComponents,
} from "@remix-run/react";
import { Suspense, forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { ForwardedRef, MouseEvent } from "react";
import "./style.css";
import EntryTable, { type EntryTableRow } from "./EntryTable";
import type { ContentDetails } from "soundscape-shared/src/content";
import { ContentFlags } from "soundscape-shared/src/schema";
import { ContentId } from "soundscape-shared/src/content";

export const meta: MetaDescriptor[] = [{ title: "Content List - Soundscape (Admin Console)" }];

export async function loader({ context }: LoaderFunctionArgs) {
    const items: Promise<EntryTableRow[]> = context.contentRepository.allDetails.then((xs) =>
        xs.map((x) => ({
            id: x.id.value,
            title: x.title,
            artist: x.artist,
            genre: x.genre,
            bpmRange: x.bpmRange,
            year: x.dateJst.getFullYear(),
            // Note: returned as 0-based(Jan = 0)
            month: x.dateJst.getMonth() + 1,
            day: x.dateJst.getDate(),
            comment: x.comment,
            dlCount: x.downloadCount,
            downloadAllowed: x.flags.downloadAllowed,
        }))
    );

    return defer({ items });
}

export async function action({ request, context }: ActionFunctionArgs) {
    // TODO: 本当はupdateのときのファイル差し替えはストリーミングアップロードしたい
    const values = await request.formData();

    const deleteAction = values.get("deleteAction");
    if (deleteAction) {
        await context.contentRepository.delete(new ContentId.External(Number(deleteAction)));
        return json({ action: "delete" });
    }

    const fromEditDialog = values.get("fromEditDialog");
    if (fromEditDialog) {
        const saveRequired = fromEditDialog !== "false";
        if (saveRequired) {
            console.log("save required", values);
            const file = values.get("file");
            const id = new ContentId.External(Number(fromEditDialog));
            const newDetails: Partial<ContentDetails> = {
                title: String(values.get("title")),
                comment: String(values.get("comment")),
                dateJst: new Date(String(values.get("time"))),
                flags: ContentFlags.fromBooleans({ allowDownload: values.get("enableDownloads") === "on" }),
            };

            if (file instanceof File) {
                // with content replacement
                await context.contentRepository.update(id, newDetails, file.type, file);
            } else {
                // preserve content
                await context.contentRepository.update(id, newDetails);
            }

            return json({ action: "update" });
        }

        return json({ action: "update-cancel" });
    }

    return new Response("unknown action", { status: 400 });
}

export function shouldRevalidate({ actionResult, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
    return actionResult ? true : defaultShouldRevalidate;
}

export default function Page() {
    const { items } = useLoaderData<typeof loader>();
    const [editing, setEditing] = useState<EntryTableRow>({
        id: 0,
        title: "",
        artist: "",
        genre: "",
        bpmRange: { min: 1, max: 1 },
        year: 0,
        month: 0,
        day: 0,
        comment: "",
        dlCount: 0,
        downloadAllowed: false,
    });
    const editDialogRef = useRef<HTMLDialogElement>(null);
    const fs = useFetcher();

    useEffect(() => {
        if (typeof fs.data !== "object" || fs.data === null) return;

        if ("action" in fs.data && (fs.data.action === "update" || fs.data.action === "update-cancel")) {
            editDialogRef.current?.close();
        }
    }, [fs.data]);

    const onEditClicked = useCallback(
        (currentValue: EntryTableRow) => (e: MouseEvent<HTMLButtonElement>) => {
            setEditing(currentValue);
            editDialogRef.current?.showModal();
        },
        []
    );

    return (
        // @ts-ignore
        <article style={{ "--maxWidth": "1280px" }}>
            <h1>登録済み一覧</h1>
            <Suspense fallback={<p>Loading...</p>}>
                <Await resolve={items}>
                    {(items) => <EntryTable initItems={items} onEditClicked={onEditClicked} />}
                </Await>
            </Suspense>
            <EditDialog ref={editDialogRef} editing={editing} fetcher={fs} />
        </article>
    );
}

const EditDialog = forwardRef(function EditDialog(
    { editing, fetcher }: { readonly editing: EntryTableRow; readonly fetcher: FetcherWithComponents<unknown> },
    ref: ForwardedRef<HTMLDialogElement>
) {
    return (
        <dialog ref={ref}>
            <h1>Edit #{editing.id}</h1>
            <fetcher.Form method="post" encType="multipart/form-data" className="contentForm">
                <fieldset disabled={fetcher.state === "submitting"} key={editing.id}>
                    <section>
                        <label htmlFor="title">タイトル</label>
                        <input id="title" name="title" defaultValue={editing.title} required />
                    </section>
                    <section>
                        <label htmlFor="artist">アーティスト表記名</label>
                        <input id="artist" name="artist" defaultValue={editing.artist} required />
                    </section>
                    <section>
                        <label htmlFor="genre">ジャンル</label>
                        <input id="genre" name="genre" defaultValue={editing.genre} required />
                    </section>
                    <section>
                        <p className="labelLike">BPM範囲</p>
                        <section className="inputGroup">
                            <input
                                name="minBPM"
                                type="number"
                                defaultValue={editing.bpmRange.min}
                                min={1}
                                className="bpmInputBox"
                                required
                            />
                            〜
                            <input
                                name="maxBPM"
                                type="number"
                                defaultValue={editing.bpmRange.max}
                                min={1}
                                className="bpmInputBox"
                                required
                            />
                        </section>
                    </section>
                    <section>
                        <label htmlFor="time">制作日</label>
                        <input
                            id="time"
                            name="time"
                            type="date"
                            defaultValue={`${editing.year}-${editing.month.toString().padStart(2, "0")}-${editing.day
                                .toString()
                                .padStart(2, "0")}`}
                            required
                        />
                    </section>
                    <section>
                        <label htmlFor="comment">コメント（Markdown可）</label>
                        <textarea id="comment" name="comment" rows={1} defaultValue={editing.comment} />
                    </section>
                    <section>
                        <label htmlFor="file">ファイル（置き換える場合）</label>
                        <input id="file" name="file" type="file" />
                    </section>
                    <section>
                        <p className="labelLike">オプション</p>
                        <div>
                            <input
                                id="enableDownloads"
                                name="enableDownloads"
                                type="checkbox"
                                defaultChecked={editing.downloadAllowed}
                            />
                            <label htmlFor="enableDownloads">ダウンロード許可</label>
                        </div>
                    </section>
                    <section className="buttons">
                        <button type="submit" name="fromEditDialog" value={editing.id.toString()}>
                            確定
                        </button>
                        <button type="submit" name="fromEditDialog" value="false">
                            取り消し
                        </button>
                    </section>
                </fieldset>
            </fetcher.Form>
        </dialog>
    );
});
