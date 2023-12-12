import { Form } from "@remix-run/react";
import { useState, type FormEvent } from "react";

export type EntryTableRow = {
    readonly id: number;
    readonly title: string;
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly downloadAllowed: boolean;
};

export default function EntryTable({ initItems }: { readonly initItems: EntryTableRow[] }) {
    const [items, setItems] = useState(initItems);

    const onSubmit = (e: FormEvent<HTMLFormElement>) => {
        const deleteAction = Number(e.currentTarget["deleteAction"].value);
        if (!confirm(`#${deleteAction}を削除してもよろしいですか？`)) {
            e.preventDefault();
            return;
        }

        setItems((xs) => xs.filter((x) => x.id !== deleteAction));
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
                            <Form method="post" replace onSubmit={onSubmit}>
                                <button type="submit" name="deleteAction" value={x.id}>
                                    削除
                                </button>
                            </Form>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
