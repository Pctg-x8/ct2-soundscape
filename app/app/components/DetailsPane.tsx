import Licenses from "@licenseDocuments";
import { Suspense } from "react";
import ReactMarkdown from "react-markdown";
import { Await, Link } from "react-router";
import remarkGfm from "remark-gfm";
import type { NumRange } from "soundscape-shared/src/content";
import { License } from "soundscape-shared/src/valueObjects/license";

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
        <article id="DetailsPane" data-show={show}>
            {data ? (
                <Suspense fallback={<p>Loading...</p>}>
                    <Await resolve={data}>{data => <Content data={data} />}</Await>
                </Suspense>
            ) : (
                <DefaultContent />
            )}
            <button type="button" id="DetailsCloseButton" onClick={onClose}>
                <span className="material-symbols-outlined">close</span>
            </button>
        </article>
    );
}

function DefaultContent() {
    return (
        <section id="DetailsDefaultContentContainer">
            <h1>Soundscape</h1>
            <p>
                主に過去の作品のうち、DL可能であるものをアーカイブとして置いています。
                <br />
                現行作品は引き続き
                <Link to="https://soundcloud.com/pctg_x8" target="_blank">
                    Soundcloud
                </Link>
            </p>
            <details>
                <summary>作品データの取扱について（ライセンス形態）</summary>
                <p>
                    作品ごとにライセンス形態が定められています。
                    再生時に表示される画面右のペインのダウンロードボタンの横に表記があるので、ご利用の際は形態に沿った取り扱いをお願いします。
                </p>
                <h2>各ライセンス表記の概要</h2>
                <p>
                    原則として
                    <Link to="https://creativecommons.org/licenses/by/4.0/legalcode.ja" target="_blank">
                        Creative Commons 4.0
                    </Link>
                    の表記を使用します（例外がある場合もあります）。
                    以下に簡易的な説明を記載しますが、詳細については各ライセンスの公式ドキュメントをご参照ください。
                </p>
                <dl>
                    <dt>CC0 (Public Domain)</dt>
                    <dd>
                        この表記がされている場合はデータに対して一切の権利を放棄している状態なので、ご自由にご利用ください。
                        <p>
                            また、このライセンス形態のデータに限り<em>無制限でのAI学習への利用が可能</em>です。
                            他のライセンス形態の場合は権利表記が不可能だったり改変禁止を満たせなかったりと、必要な制約を満たせない場合があるため学習への利用はご遠慮ください
                            （逆に言うと、それらの制約をしっかりと満たせるのであればやってもよいです。だいぶ難しい気はしますが）。
                        </p>
                    </dd>
                    <dt>Creative Commons BY (Attribution)</dt>
                    <dd>
                        データの利用に際し、権利者表記を誰もが参照可能な場所に記載する必要があります。
                        <p>この場合の権利者表記は原則としてアーティスト表記名でお願いします。</p>
                    </dd>
                    <dt>Creative Commons BY-SA (Attribution, Share Alike)</dt>
                    <dd>Creative Commons BYの制約に加え、再配布時の取り扱いも同様のライセンスとしてください。</dd>
                    <dt>Creative Commons BY-NC (Attribution, Non-Commercial)</dt>
                    <dd>Creative Commons BYの制約に加え、このデータの営利目的での利用を禁止します。</dd>
                    <dt>Creative Commons BY-ND (Attribution, Non-Derivative)</dt>
                    <dd>Creative Commons BYの制約に加え、改変したデータの配布を禁止します。</dd>
                    <dt>Creative Commons BY-NC-SA (Attribution, Non-Commercial, Share Alike)</dt>
                    <dd>
                        Creative Commons BY, NC, SAのすべての制約を満たす必要があります。
                        <ul>
                            <li>BY: 権利者表記が必要です</li>
                            <li>NC: 営利目的での利用は不可です</li>
                            <li>SA: データを再配布する場合は同様のライセンスを付与してください</li>
                        </ul>
                    </dd>
                    <dt>Creative Commons BY-NC-ND (Attribution, Non-Commercial, Non-Derivative)</dt>
                    <dd>
                        Creative Commons BY, NC, NDのすべての制約を満たす必要があります。
                        <ul>
                            <li>BY: 権利者表記が必要です</li>
                            <li>NC: 営利目的での利用は不可です</li>
                            <li>ND: 改変したデータの配布は不可です</li>
                        </ul>
                    </dd>
                    <dt>上記以外の指定がある場合</dt>
                    <dd>指定内容に合わせた取り扱いをお願いします。</dd>
                </dl>
            </details>
            <details>
                <summary>このサイトで使用している素材の権利表記</summary>
                <section className="relaxedDetailContent">
                    <h2>Google Material Icons</h2>
                    <pre>{Licenses.GoogleMaterialIcons}</pre>
                    <h2>Inter</h2>
                    <pre>{Licenses.Inter}</pre>
                </section>
            </details>
        </section>
    );
}

function Content({ data }: { readonly data: Details }) {
    return (
        <section id="DetailsContentContainer">
            <h2>{data.genre}</h2>
            <h1>
                <small>{data.artist} - </small>
                {data.title}
            </h1>
            <ul>
                <li>{formatCreateDate(data.year, data.month, data.day)}</li>
                <li>{formatBPM(data.bpmRange)}</li>
            </ul>
            <section id="DetailsComment">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{ a: props => <a {...props} target="_blank" /> }}
                >
                    {data.comment || "（コメントなし）"}
                </ReactMarkdown>
            </section>
            <section id="DetailsDownloadSection">
                <p>{formatLicense(data.license)}</p>
                <a href={`/content/${data.id}/download`} download>
                    <span className="material-symbols-outlined">download</span>ダウンロード
                </a>
            </section>
        </section>
    );
}

function formatCreateDate(year: number, month: number, day: number): string {
    return `制作日: ${year}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}`;
}

function formatBPM(range: NumRange): string {
    if (range.min === range.max) {
        return `BPM: ${range.min}`;
    }

    return `BPM: ${range.min}～${range.max}`;
}

function formatLicense(license: License.Type): string {
    switch (license) {
        case License.PublicDomain:
            return "ライセンス形態: CC0 (Public Domain)";
        case License.CreativeCommons4.BY:
            return "ライセンス形態: Creative Commons BY";
        case License.CreativeCommons4.BY_SA:
            return "ライセンス形態: Creative Commons BY-SA";
        case License.CreativeCommons4.BY_ND:
            return "ライセンス形態: Creative Commons BY-ND";
        case License.CreativeCommons4.BY_NC:
            return "ライセンス形態: Creative Commons BY-NC";
        case License.CreativeCommons4.BY_NC_ND:
            return "ライセンス形態: Creative Commons BY-NC-ND";
        case License.CreativeCommons4.BY_NC_SA:
            return "ライセンス形態: Creative Commons BY-NC-SA";
        default:
            return `ライセンス形態: ${license}`;
    }
}
