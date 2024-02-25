import { Form, type MetaDescriptor } from "@remix-run/react";
import { type DragEvent, useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { readFileMetadata } from "src/contentReader";
import { License } from "soundscape-shared/src/valueObjects/license";
import * as zfd from "zod-form-data";
import * as z from "zod";
import { pick } from "soundscape-shared/src/utils/typeImpl";
import { type CompleteBodyData } from "../cmd.upload.$id.complete/route";
import { guard } from "src/promiseWrapper";
import { uploadMultiparted } from "src/multipartUploader";

export const meta: MetaDescriptor[] = [{ title: "Multiple Uploader - Soundscape (Admin Console)" }];

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
    const [result, setResult] = useState<SubmitState>(undefined);
    const [isPending, setIsPending] = useState(false);

    const formid = `uploadForm-${identifier}`;

    const [currentLicenseSelection, setCurrentLicenseSelection] = useState<number>(0);
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
                    setTitle(value);
                },
                onArtist(value) {
                    artistInput.value = value;
                    setArtist(value);
                },
                onGenre(value) {
                    genreInput.value = value;
                },
            })
        );
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
            if (result !== undefined) return;
            if (isPending) return;

            form.current?.requestSubmit();
        });

        return () => unregisterSubmission(identifier);
    }, [identifier, registerSubmission, unregisterSubmission, result, isPending]);

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();

        const data = new FormData(e.target as HTMLFormElement);
        const file = data.get("file") as File;
        if (!file) {
            throw new Error("File is empty");
        }

        const parsedData = FormDataSchema.parse(data);
        const details: CompleteBodyData = {
            ...pick(
                parsedData,
                "title",
                "artist",
                "genre",
                "minBPM",
                "maxBPM",
                "comment",
                "licenseType",
                "licenseText"
            ),
            year: parsedData.time.getFullYear(),
            month: parsedData.time.getMonth() + 1,
            day: parsedData.time.getDate(),
        };

        await guard(
            setIsPending,
            uploadMultiparted(file, details, (sentBytes) => {
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

    const right = (() => {
        switch (result?.state) {
            case "Success":
                return <p className="success">#{result.id}</p>;
            case "Failed":
                return (
                    <>
                        <p className="failed">FAILED</p>
                        <button type="submit" className="positive" form={formid}>
                            登録
                        </button>
                        <button type="button" onClick={onCancel}>
                            登録せず削除
                        </button>
                    </>
                );
            default:
                return (
                    <>
                        <button type="submit" className="positive" form={formid} disabled={isPending}>
                            登録
                        </button>
                        <button type="button" onClick={onCancel} disabled={isPending}>
                            登録せず削除
                        </button>
                    </>
                );
        }
    })();

    return (
        <section className="multiUploadEntry">
            <details>
                <summary>
                    <p className="titles">
                        {artist} - {title}
                    </p>
                    {right}
                </summary>
                <Form
                    method="post"
                    encType="multipart/form-data"
                    className="contentForm"
                    ref={form}
                    id={formid}
                    onSubmit={onSubmit}
                >
                    <fieldset disabled={isPending || result?.state === "Success"}>
                        <section>
                            <label htmlFor="title">タイトル</label>
                            <input id="title" name="title" onChange={(e) => setTitle(e.currentTarget.value)} required />
                        </section>
                        <section>
                            <label htmlFor="artist">アーティスト表記名</label>
                            <input
                                id="artist"
                                name="artist"
                                onChange={(e) => setArtist(e.currentTarget.value)}
                                required
                            />
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
                            <button type="reset" className="negative">
                                入力内容をリセット
                            </button>
                        </section>
                    </fieldset>
                </Form>
            </details>
            {result?.state === "Pending" ? (
                <div
                    className="progressOverlay"
                    style={{ width: (100 * result.sentBytes) / result.totalBytes + "%" }}
                />
            ) : undefined}
        </section>
    );
}
