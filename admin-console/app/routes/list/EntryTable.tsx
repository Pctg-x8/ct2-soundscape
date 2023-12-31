import { useFetcher } from "@remix-run/react";
import type { MouseEventHandler, FormEvent } from "react";
import type { NumRange } from "soundscape-shared/src/content";
import { License } from "soundscape-shared/src/valueObjects/license";

export type EntryTableRow = {
    readonly id: number;
    readonly title: string;
    readonly artist: string;
    readonly genre: string;
    readonly bpmRange: NumRange;
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly comment: string;
    readonly dlCount: number;
    readonly license: License.Type;
};

export default function EntryTable({
    initItems,
    onEditClicked,
}: {
    readonly initItems: EntryTableRow[];
    readonly onEditClicked: (current: EntryTableRow) => MouseEventHandler<HTMLButtonElement>;
}) {
    const f = useFetcher();
    const items = f.formData ? initItems.filter((x) => x.id !== Number(f.formData?.get("deleteAction"))) : initItems;

    const onSubmit = (e: FormEvent<HTMLFormElement>) => {
        const deleteAction = Number(e.currentTarget["deleteAction"].value);
        if (!confirm(`#${deleteAction}を削除してもよろしいですか？`)) {
            e.preventDefault();
            return;
        }
    };

    return (
        <table id="EntryTable">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>タイトル</th>
                    <th>アーティスト表記名</th>
                    <th>ジャンル</th>
                    <th>制作日</th>
                    <th>ライセンス</th>
                    <th>DLCount</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                {items.map((x) => (
                    <tr key={x.id}>
                        <td className="num">{x.id}</td>
                        <td>{x.title}</td>
                        <td>{x.artist}</td>
                        <td>{x.genre}</td>
                        <td className="center">
                            {x.year.toString()}/{x.month.toString().padStart(2, "0")}/
                            {x.day.toString().padStart(2, "0")}
                        </td>
                        <td>{licenseText(x.license)}</td>
                        <td className="num">{x.dlCount}</td>
                        <td className="actionButtons">
                            <f.Form method="post" onSubmit={onSubmit}>
                                <button type="submit" name="deleteAction" value={x.id}>
                                    削除
                                </button>
                                <button type="button" onClick={onEditClicked(x)}>
                                    編集
                                </button>
                            </f.Form>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function licenseText(l: License.Type): string {
    switch (l) {
        case License.PublicDomain:
            return "CC0";
        case License.CreativeCommons4.BY:
            return "CC-BY";
        case License.CreativeCommons4.BY_SA:
            return "CC-BY-SA";
        case License.CreativeCommons4.BY_NC:
            return "CC-BY-NC";
        case License.CreativeCommons4.BY_NC_SA:
            return "CC-BY-NC-SA";
        case License.CreativeCommons4.BY_NC_ND:
            return "CC-BY-NC-ND";
        case License.CreativeCommons4.BY_ND:
            return "CC-BY-ND";
        default:
            return l;
    }
}
