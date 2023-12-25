import { type MetaDescriptor, useFetcher } from "@remix-run/react";
import {
    unstable_createMemoryUploadHandler,
    type ActionFunctionArgs,
    unstable_parseMultipartFormData,
    json,
} from "@remix-run/cloudflare";
import { ContentFlags } from "soundscape-shared/src/schema";
import { type DragEvent, useEffect, useRef, useState, useCallback } from "react";
import { readFileMetadata } from "src/contentReader";

export const meta: MetaDescriptor[] = [{ title: "Multiple Uploader - Soundscape (Admin Console)" }];

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
        file.type,
        file
    );

    return json({ success: id.value });
}

async function recursiveQueryAllFiles(dir: FileSystemDirectoryEntry): Promise<File[]> {
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        dir.createReader().readEntries(resolve, reject)
    );

    return await Promise.all(
        entries.map((e) => {
            if (e.isFile) {
                return new Promise<File>((resolve, reject) => (e as FileSystemFileEntry).file(resolve, reject)).then(
                    (x) => [x]
                );
            }
            if (e.isDirectory) {
                return recursiveQueryAllFiles(e as FileSystemDirectoryEntry);
            }

            return Promise.resolve([]);
        })
    ).then((xs) => xs.flat());
}

export default function Page() {
    const [initFiles, setInitFiles] = useState<(readonly [number, File | null])[]>([]);
    const entryIdCounter = useRef(1);
    const submissionOps = useRef<{ [key: number]: () => void }>({});

    const onDragOver = (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
    };

    const onDropFiles = async (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files === null) return;
        const files = await Promise.all(
            Array.from(e.dataTransfer.items).map((x) => {
                const e = x.webkitGetAsEntry();
                if (!e) return Promise.resolve([]);

                if (e.isDirectory) return recursiveQueryAllFiles(e as FileSystemDirectoryEntry);
                if (e.isFile) {
                    return new Promise<File>((resolve, reject) =>
                        (e as FileSystemFileEntry).file(resolve, reject)
                    ).then((x) => [x]);
                }

                return Promise.resolve([]);
            })
        ).then((xs) => xs.flat().filter((x) => x.type.startsWith("audio/")));

        setInitFiles((fs) => [...fs, ...files.map((f, o) => [entryIdCounter.current + o, f] as const)]);
        entryIdCounter.current += files.length;
    };

    const onAddClicked = () => {
        setInitFiles((fs) => [...fs, [entryIdCounter.current, null] as const]);
        entryIdCounter.current += 1;
    };

    const onCancel = (key: number) => () => {
        setInitFiles((fs) => fs.filter(([k, _]) => k !== key));
    };

    const registerSubmission = useCallback((identifier: number, submit: () => void) => {
        submissionOps.current[identifier] = submit;
    }, []);
    const unregisterSubmission = useCallback((identifier: number) => {
        delete submissionOps.current[identifier];
    }, []);

    const onSubmitAllClicked = () => {
        for (const op of Object.values(submissionOps.current)) {
            op();
        }
    };

    return (
        <article>
            <h1>複数ファイルアップロード</h1>
            <section id="MultiUploadDropArea" onDragOver={onDragOver} onDrop={onDropFiles}>
                ここにファイルをドロップ
            </section>
            <button type="button" id="MultiUploadSubmitAllButton" onClick={onSubmitAllClicked}>
                すべて登録
            </button>
            {initFiles.map(([key, f]) => (
                <Entry
                    key={key}
                    identifier={key}
                    initFile={f ?? undefined}
                    onCancel={onCancel(key)}
                    registerSubmission={registerSubmission}
                    unregisterSubmission={unregisterSubmission}
                />
            ))}
            <button type="button" id="MultiUploadAddButton" onClick={onAddClicked}>
                追加
            </button>
        </article>
    );
}

function Entry({
    identifier,
    initFile,
    onCancel,
    registerSubmission,
    unregisterSubmission,
}: {
    readonly identifier: number;
    readonly initFile?: File;
    readonly onCancel: () => void;
    readonly registerSubmission: (identifier: number, submit: () => void) => void;
    readonly unregisterSubmission: (identifier: number) => void;
}) {
    const f = useFetcher<typeof action>();
    const isPending = f.state == "submitting";

    const formid = `uploadForm-${identifier}`;

    const [title, setTitle] = useState("");
    const [artist, setArtist] = useState("");

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
        setTitle("");
        setArtist("");

        await readFileMetadata(file.current, {
            onLastModifiedDate(d) {
                timeInput.value = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
                    .getDate()
                    .toString()
                    .padStart(2, "0")}`;
            },
            onTitle(value) {
                titleInput.value = value;
                setTitle(value);
            },
            onArtist(value) {
                artistInput.value = value;
                setArtist(value);
            },
            onGenre(value) {
                genreInput.value = value;
            },
        });
    };

    useEffect(() => {
        if (!initFile || !form.current) return;

        // setting initial file selection via DataTransfer: https://pqina.nl/blog/set-value-to-file-input/
        const dt = new DataTransfer();
        dt.items.add(initFile);
        (form.current["file"] as unknown as HTMLInputElement).files = dt.files;
        file.current = initFile;

        onAutoInputClicked();
    }, [initFile]);

    // registers submission operation to container component
    useEffect(() => {
        registerSubmission(identifier, () => {
            if (f.data !== undefined) return;
            if (f.state !== "idle") return;

            form.current?.requestSubmit();
        });

        return () => unregisterSubmission(identifier);
    }, [identifier, registerSubmission, unregisterSubmission, f]);

    return (
        <details className="multiUploadEntry">
            <summary>
                <p className="titles">
                    {artist} - {title}
                </p>
                {f.data?.success ? (
                    <p className="success">#{f.data.success}</p>
                ) : (
                    <>
                        <button type="submit" className="positive" form={formid} disabled={isPending}>
                            登録
                        </button>
                        <button type="button" onClick={onCancel} disabled={isPending}>
                            登録せず削除
                        </button>
                    </>
                )}
            </summary>
            <f.Form method="post" encType="multipart/form-data" className="contentForm" ref={form} id={formid}>
                <fieldset disabled={isPending || (Boolean(f.data?.success) ?? false)}>
                    <section>
                        <label htmlFor="title">タイトル</label>
                        <input id="title" name="title" onChange={(e) => setTitle(e.currentTarget.value)} required />
                    </section>
                    <section>
                        <label htmlFor="artist">アーティスト表記名</label>
                        <input id="artist" name="artist" onChange={(e) => setArtist(e.currentTarget.value)} required />
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
                        <p className="labelLike">オプション</p>
                        <div>
                            <input id="enableDownloads" name="enableDownloads" type="checkbox" />
                            <label htmlFor="enableDownloads">ダウンロード許可</label>
                        </div>
                    </section>
                    <section className="buttons">
                        <button type="reset" className="negative">
                            入力内容をリセット
                        </button>
                    </section>
                </fieldset>
            </f.Form>
        </details>
    );
}
