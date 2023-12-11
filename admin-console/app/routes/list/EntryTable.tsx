import { Form } from "@remix-run/react";
import type { SerializeFrom } from "@remix-run/cloudflare";
import { useState, type FormEvent } from "react";
import type { Details } from "../../../../src/schema";

export default function EntryTable({ initItems }: { readonly initItems: SerializeFrom<Details>[] }) {
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
                    <th></th>
                </tr>
            </thead>
            <tbody>
                {items.map((x) => (
                    <tr key={x.id}>
                        <td className="num">{x.id}</td>
                        <td>{x.title}</td>
                        <td>
                            {new Date(x.dateJst).toLocaleDateString("ja-jp", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                            })}
                        </td>
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
