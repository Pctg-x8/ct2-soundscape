import { Await, useSearchParams } from "@remix-run/react";
import { Suspense } from "react";
import type { NumRange } from "soundscape-shared/src/content";
import type { License } from "soundscape-shared/src/valueObjects/license";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type Details = {
    readonly title: string;
    readonly artist: string;
    readonly genre: string;
    readonly bpmRange: NumRange;
    readonly comment: string;
    readonly license: License.Type;
    readonly downloadUrl?: string;
};

export default function DetailsPane({ data }: { readonly data: Promise<Details> | undefined }) {
    if (data === undefined) {
        return <article id="DetailsPane"></article>;
    }

    return (
        <article id="DetailsPane" className="show">
            <Suspense fallback={<p>Loading...</p>}>
                <Await resolve={data}>{(data) => <Content data={data} />}</Await>
            </Suspense>
        </article>
    );
}

function Content({ data }: { readonly data: Details }) {
    const [, setSearchParams] = useSearchParams();

    const onClickClose = () => {
        setSearchParams((sp) => {
            sp.delete("details");
            return sp;
        });
    };

    return (
        <>
            <h2>{data.genre}</h2>
            <h1>
                <small>{data.artist} - </small>
                {data.title}
            </h1>
            <p>
                BPM:&nbsp;
                {data.bpmRange.min === data.bpmRange.max
                    ? data.bpmRange.min
                    : `${data.bpmRange.min}～${data.bpmRange.max}`}
            </p>
            <section id="DetailsComment">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    // eslint-disable-next-line jsx-a11y/anchor-has-content
                    components={{ a: (props) => <a {...props} target="_blank" /> }}
                >
                    {data.comment || "（コメントなし）"}
                </ReactMarkdown>
            </section>
            <button type="button" id="DetailsCloseButton" onClick={onClickClose}>
                <span className="material-symbols-outlined">close</span>
            </button>
        </>
    );
}
