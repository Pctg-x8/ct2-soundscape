import { type CompleteBodyData } from "~/routes/cmd.upload.$id.complete/route";
import { ReturnSchema } from "~/routes/cmd.upload.begin/route";

class PendingUpload {
    static async begin(contentType: string): Promise<PendingUpload> {
        const r = await fetch("/cmd/upload/begin", { method: "POST", headers: { "content-type": contentType } });
        if (!r.ok) throw new Error(r.statusText);

        const { id } = ReturnSchema.parse(await r.json());

        return new PendingUpload(id);
    }

    constructor(private readonly tempId: number) {}

    async uploadPart(partNumber: number, data: Blob): Promise<void> {
        const r = await fetch(`/cmd/upload/${this.tempId}/${partNumber}`, { method: "POST", body: data });
        if (!r.ok) throw new Error(r.statusText);
    }

    async complete(details: CompleteBodyData): Promise<number> {
        const r = await fetch(`/cmd/upload/${this.tempId}/complete`, { method: "POST", body: JSON.stringify(details) });
        if (!r.ok) throw new Error(r.statusText);

        return this.tempId;
    }
}

export async function uploadMultiparted(
    content: Blob,
    details: CompleteBodyData,
    progress: (sentBytes: number) => void,
): Promise<number> {
    const PART_SIZE = 8 * 1024 * 1024;

    progress(0);
    const tempContent = await PendingUpload.begin(content.type);

    let partNumber = 0;
    while (partNumber * PART_SIZE < content.size) {
        const part = content.slice(partNumber * PART_SIZE, (partNumber + 1) * PART_SIZE);
        const op = tempContent.uploadPart(partNumber + 1, part);
        progress(partNumber * PART_SIZE);
        await op;
        partNumber++;
    }

    const leftSize = content.size - partNumber * PART_SIZE;
    const finalOp =
        leftSize > 0
            ? tempContent.uploadPart(partNumber + 1, content.slice(partNumber * PART_SIZE, content.size))
            : Promise.resolve();
    progress(content.size);
    await finalOp;

    return await tempContent.complete(details);
}
