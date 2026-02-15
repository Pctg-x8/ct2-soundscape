import type { ForwardedRef, MouseEvent } from "react";
import { Suspense, forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
    type ActionFunctionArgs,
    Await,
    type FetcherWithComponents,
    type ShouldRevalidateFunctionArgs,
    useFetcher,
    useLoaderData,
} from "react-router";
import type {
    ContentAdminMultipartRepository,
    ContentAdminRepository,
    ContentDetails,
} from "soundscape-shared/src/content";
import { ContentId } from "soundscape-shared/src/content/id";
import { License } from "soundscape-shared/src/valueObjects/license";
import * as z from "zod";
import { type Route } from "./+types/route";
import EntryTable, { type EntryTableRow } from "./EntryTable";
import "./style.css";

import { FileUpload, parseFormData } from "@remix-run/form-data-parser";
import { badRequest } from "soundscape-shared/src/utils/genericResponse";
import { pick } from "soundscape-shared/src/utils/typeImpl";
import { convertLicenseInput } from "src/conversion";
import { createRepositoryAccess } from "src/repository";
import * as zfd from "zod-form-data";

export async function loader({ context }: Route.LoaderArgs) {
    const items: Promise<EntryTableRow[]> = createRepositoryAccess(
        context.env,
        context.executionContext,
    ).allDetails.then(xs =>
        xs.map(x => ({
            id: x.id.value,
            ...pick(x, "title", "artist", "genre", "bpmRange", "comment", "license"),
            year: x.dateJst.getFullYear(),
            // Note: returned as 0-based(Jan = 0)
            month: x.dateJst.getMonth() + 1,
            day: x.dateJst.getDate(),
            dlCount: x.downloadCount,
        })),
    );

    return { items };
}

const DeleteActionInputSchema = zfd.formData({ deleteAction: ContentId.External.ZodSchema });
const ModifyActionInputSchema = zfd.formData({
    fromEditDialog: zfd.text(z.enum(["cancel"])).or(ContentId.External.ZodSchema),
    title: zfd.text(),
    artist: zfd.text(),
    genre: zfd.text(),
    minBPM: zfd.numeric(),
    maxBPM: zfd.numeric(),
    comment: zfd.text(z.string().optional()).transform(x => x ?? ""),
    time: zfd.text().transform(x => new Date(x)),
    licenseType: zfd.numeric(),
    licenseText: zfd.text(z.string().optional()).transform(x => x ?? ""),
    file: zfd.file(z.instanceof(File).optional()),
});
const ActionInputSchema = DeleteActionInputSchema.or(ModifyActionInputSchema);

async function performDelete(contentRepository: ContentAdminRepository, id: ContentId.External): Promise<void> {
    await contentRepository.delete(id);
}

async function performSave(
    contentRepository: ContentAdminMultipartRepository,
    id: ContentId.External,
    input: z.infer<typeof ModifyActionInputSchema>,
): Promise<void> {
    let license: License.Type;
    try {
        license = convertLicenseInput(input);
    } catch (e) {
        console.error("invalid license input", e);
        throw badRequest();
    }

    const newDetails: Partial<ContentDetails> = {
        ...pick(input, "title", "artist", "genre", "comment"),
        bpmRange: { min: input.minBPM, max: input.maxBPM },
        dateJst: input.time,
        license,
    };

    if (input.file instanceof File) {
        // with content replacement
        await contentRepository.update(id, newDetails, input.file.type, input.file);
    } else {
        // preserve content
        await contentRepository.update(id, newDetails);
    }
}

export async function action({ request, context }: ActionFunctionArgs) {
    const nonMultipart =
        request.headers.get("Content-Type") === "application/x-www-form-urlencoded" ||
        (request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded;") ?? false);

    // TODO: 本当はupdateのときのファイル差し替えはストリーミングアップロードしたい
    const values = nonMultipart
        ? await request.formData()
        : await parseFormData(request, async (upload: FileUpload) => {
              // TODO: process streaming upload
              console.dir(upload);
          });

    const tryInput = ActionInputSchema.safeParse(values);
    if (!tryInput.success) {
        console.error("invalid form data", tryInput.error, values);
        throw badRequest();
    }
    const input = tryInput.data;

    const contentRepository = createRepositoryAccess(context.env, context.executionContext);

    if ("deleteAction" in input) {
        await performDelete(contentRepository, input.deleteAction);
        return Response.json({ action: "delete" });
    }

    if ("fromEditDialog" in input) {
        if (input.fromEditDialog === "cancel") {
            // cancelled action(no performs)
            return Response.json({ action: "update-cancel" });
        }

        // save required
        await performSave(contentRepository, input.fromEditDialog, input);
        return Response.json({ action: "update" });
    }

    console.error("unknown action", input);
    throw badRequest();
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
        year: 1,
        month: 1,
        day: 1,
        comment: "",
        dlCount: 0,
        license: License.PublicDomain,
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
        [],
    );

    return (
        // @ts-ignore
        <article style={{ "--maxWidth": "1280px" }}>
            <title>Content List - Soundscape (Admin Console)</title>
            <h1>登録済み一覧</h1>
            <Suspense fallback={<p>Loading...</p>}>
                <Await resolve={items}>{items => <EntryTable initItems={items} onEditClicked={onEditClicked} />}</Await>
            </Suspense>
            <EditDialog ref={editDialogRef} editing={editing} fetcher={fs} />
        </article>
    );
}

const LicenseNonConstValue = 999;

function EditForm({
    defaultValues,
    fetcher,
}: {
    readonly defaultValues: EntryTableRow;
    readonly fetcher: FetcherWithComponents<unknown>;
}) {
    const [currentLicenseSelection, setCurrentLicenseSelection] = useState<number>(() => {
        switch (defaultValues.license) {
            case License.PublicDomain:
            case License.CreativeCommons4.BY:
            case License.CreativeCommons4.BY_NC:
            case License.CreativeCommons4.BY_SA:
            case License.CreativeCommons4.BY_ND:
            case License.CreativeCommons4.BY_NC_ND:
            case License.CreativeCommons4.BY_NC_SA:
                return defaultValues.license;
            default:
                return LicenseNonConstValue;
        }
    });

    return (
        <fetcher.Form method="post" encType="multipart/form-data" className="contentForm">
            <fieldset disabled={fetcher.state === "submitting"}>
                <section>
                    <label htmlFor="title">タイトル</label>
                    <input id="title" name="title" defaultValue={defaultValues.title} required />
                </section>
                <section>
                    <label htmlFor="artist">アーティスト表記名</label>
                    <input id="artist" name="artist" defaultValue={defaultValues.artist} required />
                </section>
                <section>
                    <label htmlFor="genre">ジャンル</label>
                    <input id="genre" name="genre" defaultValue={defaultValues.genre} required />
                </section>
                <section>
                    <p className="labelLike">BPM範囲</p>
                    <section className="inputGroup">
                        <input
                            name="minBPM"
                            type="number"
                            defaultValue={defaultValues.bpmRange.min}
                            min={1}
                            className="bpmInputBox"
                            required
                        />
                        〜
                        <input
                            name="maxBPM"
                            type="number"
                            defaultValue={defaultValues.bpmRange.max}
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
                        defaultValue={`${defaultValues.year.toString().padStart(4, "0")}-${defaultValues.month
                            .toString()
                            .padStart(2, "0")}-${defaultValues.day.toString().padStart(2, "0")}`}
                        required
                    />
                </section>
                <section>
                    <label htmlFor="comment">コメント（Markdown可）</label>
                    <textarea id="comment" name="comment" rows={1} defaultValue={defaultValues.comment} />
                </section>
                <section>
                    <label htmlFor="file">ファイル（置き換える場合）</label>
                    <input id="file" name="file" type="file" accept="audio/*" />
                </section>
                <section>
                    <label htmlFor="licenseType">ライセンス形態</label>
                    <div className="licenseInputs">
                        <select
                            id="licenseType"
                            name="licenseType"
                            defaultValue={currentLicenseSelection}
                            onChange={e => setCurrentLicenseSelection(Number(e.currentTarget.value))}
                        >
                            <option value={License.PublicDomain}>CC0</option>
                            <option value={License.CreativeCommons4.BY}>CC-BY</option>
                            <option value={License.CreativeCommons4.BY_SA}>CC-BY-SA</option>
                            <option value={License.CreativeCommons4.BY_NC}>CC-BY-NC</option>
                            <option value={License.CreativeCommons4.BY_NC_SA}>CC-BY-NC-SA</option>
                            <option value={License.CreativeCommons4.BY_NC_ND}>CC-BY-NC-ND</option>
                            <option value={License.CreativeCommons4.BY_ND}>CC-BY-ND</option>
                            <option value={LicenseNonConstValue}>その他</option>
                        </select>
                        <input
                            name="licenseText"
                            defaultValue={typeof defaultValues.license === "string" ? defaultValues.license : ""}
                            disabled={currentLicenseSelection !== LicenseNonConstValue}
                        />
                    </div>
                </section>
                <section className="buttons">
                    <button type="submit" name="fromEditDialog" value={defaultValues.id.toString()}>
                        確定
                    </button>
                    <button type="submit" name="fromEditDialog" value="cancel">
                        取り消し
                    </button>
                </section>
            </fieldset>
        </fetcher.Form>
    );
}

const EditDialog = forwardRef(function EditDialog(
    { editing, fetcher }: { readonly editing: EntryTableRow; readonly fetcher: FetcherWithComponents<unknown> },
    ref: ForwardedRef<HTMLDialogElement>,
) {
    return (
        <dialog ref={ref}>
            <h1>Edit #{editing.id}</h1>
            <EditForm fetcher={fetcher} defaultValues={editing} key={editing.id} />
        </dialog>
    );
});
