import { Await } from "@remix-run/react";
import { Suspense } from "react";
import type { NumRange } from "soundscape-shared/src/content";
import { License } from "soundscape-shared/src/valueObjects/license";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type Details = {
    readonly id: number;
    readonly title: string;
    readonly artist: string;
    readonly genre: string;
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly bpmRange: NumRange;
    readonly comment: string;
    readonly license: License.Type;
};

export default function DetailsPane({
    show = false,
    data,
    onClose,
}: {
    readonly show?: boolean;
    readonly data: Promise<Details> | undefined;
    readonly onClose: () => void;
}) {
    return (
        <article id="DetailsPane" className={show ? "show" : undefined}>
            {data ? (
                <Suspense fallback={<p>Loading...</p>}>
                    <Await resolve={data}>{(data) => <Content data={data} />}</Await>
                </Suspense>
            ) : undefined}
            <button type="button" id="DetailsCloseButton" onClick={onClose}>
                <span className="material-symbols-outlined">close</span>
            </button>
        </article>
    );
}

function Content({ data }: { readonly data: Details }) {
    console.log(data);
    return (
        <section id="DetailsContentContainer">
            <h2>{data.genre}</h2>
            <h1>
                <small>{data.artist} - </small>
                {data.title}
            </h1>
            <ul>
                <li>
                    制作日:&nbsp;{data.year}/{data.month.toString().padStart(2, "0")}/
                    {data.day.toString().padStart(2, "0")}
                </li>
                <li>
                    BPM:&nbsp;
                    {data.bpmRange.min === data.bpmRange.max
                        ? data.bpmRange.min
                        : `${data.bpmRange.min}～${data.bpmRange.max}`}
                </li>
            </ul>
            <section id="DetailsComment">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    // eslint-disable-next-line jsx-a11y/anchor-has-content
                    components={{ a: (props) => <a {...props} target="_blank" /> }}
                >
                    {data.comment || "（コメントなし）"}
                </ReactMarkdown>
            </section>
            <section id="DetailsDownloadSection">
                <p>ライセンス形態: {formatLicense(data.license)}</p>
                <a href={`/content/${data.id}/download`} download>
                    <span className="material-symbols-outlined">download</span>ダウンロード
                </a>
            </section>
        </section>
    );
}

function formatLicense(license: License.Type): string {
    switch (license) {
        case License.PublicDomain:
            return "CC0 (Public Domain)";
        case License.CreativeCommons4.BY:
            return "Creative Commons BY";
        case License.CreativeCommons4.BY_SA:
            return "Creative Commons BY-SA";
        case License.CreativeCommons4.BY_ND:
            return "Creative Commons BY-ND";
        case License.CreativeCommons4.BY_NC:
            return "Creative Commons BY-NC";
        case License.CreativeCommons4.BY_NC_ND:
            return "Creative Commons BY-NC-ND";
        case License.CreativeCommons4.BY_NC_SA:
            return "Creative Commons BY-NC-SA";
        default:
            return license;
    }
}
