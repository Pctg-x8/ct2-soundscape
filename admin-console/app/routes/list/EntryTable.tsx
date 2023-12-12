import { useFetcher } from "@remix-run/react";
import { type FormEvent } from "react";

export type EntryTableRow = {
    readonly id: number;
    readonly title: string;
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly downloadAllowed: boolean;
};

export default function EntryTable({ initItems }: { readonly initItems: EntryTableRow[] }) {
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
                    <th>制作日</th>
                    <th>Flags</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                {items.map((x) => (
                    <tr key={x.id}>
                        <td className="num">{x.id}</td>
                        <td>{x.title}</td>
                        <td>
                            {x.year.toString()}/{x.month.toString().padStart(2, "0")}/
                            {x.day.toString().padStart(2, "0")}
                        </td>
                        <td>{x.downloadAllowed ? "DL可" : ""}</td>
                        <td>
                            <f.Form method="post" onSubmit={onSubmit}>
                                <button type="submit" name="deleteAction" value={x.id}>
                                    削除
                                </button>
                                <button type="button">編集</button>
                            </f.Form>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
