function unFourccLE(x: number): string {
    return String.fromCharCode(x & 0xff, (x >> 8) & 0xff, (x >> 16) & 0xff, (x >> 24) & 0xff);
}

export type RIFFFileHeader = {
    readonly signature: number;
    readonly chunkSize: number;
    readonly format: number;
};
export function readRIFFFileHeader(content: DataView): RIFFFileHeader | null {
    const signature = content.getUint32(0, false);
    if (signature != 0x52494646) return null;

    return {
        signature,
        chunkSize: content.getUint32(4, true),
        format: content.getUint32(8, false),
    };
}
export function isRIFFWave(content: DataView): boolean {
    const fileHeader = readRIFFFileHeader(content);

    return fileHeader !== null && fileHeader.format === 0x57415645;
}

export interface RIFFChunkHandler {
    onList(chunk: ListRIFFChunk): void;
    onUnknown(chunk: UnknownRIFFChunk): void;
}

export abstract class RIFFChunk {
    abstract get contentView(): DataView;
    get entireChunkSize(): number {
        return this.contentView.byteLength + 8;
    }
    get nextChunkOffset(): number {
        return this.contentView.byteOffset + this.entireChunkSize;
    }

    abstract handle(handler: RIFFChunkHandler): void;

    static read(content: DataView): RIFFChunk {
        const id = unFourccLE(content.getUint32(0, true));
        const byteLength = content.getUint32(4, true);
        const contentView = new DataView(content.buffer, content.byteOffset + 8, byteLength);

        switch (id) {
            case "LIST":
                return new ListRIFFChunk(contentView);
            default:
                return new UnknownRIFFChunk(id, new DataView(content.buffer, content.byteOffset + 8, byteLength));
        }
    }

    static readAll(content: DataView, handler: RIFFChunkHandler) {
        let offset = 0;

        while (offset < content.byteLength) {
            const chunk = RIFFChunk.read(new DataView(content.buffer, content.byteOffset + offset));
            chunk.handle(handler);
            offset += chunk.entireChunkSize;
        }
    }
}

export class UnknownRIFFChunk extends RIFFChunk {
    constructor(
        readonly id: string,
        readonly contentView: DataView
    ) {
        super();
    }

    override handle(handler: RIFFChunkHandler) {
        handler.onUnknown(this);
    }
}

export class ListRIFFChunk extends RIFFChunk {
    constructor(readonly contentView: DataView) {
        super();
    }

    get ty(): string {
        return unFourccLE(this.contentView.getUint32(0, true));
    }

    override handle(handler: RIFFChunkHandler) {
        handler.onList(this);
    }

    tryConvertToInfoList(): RIFFInfoList | null {
        return this.ty === "INFO"
            ? new RIFFInfoList(
                  new DataView(
                      this.contentView.buffer,
                      this.contentView.byteOffset + 4,
                      this.contentView.byteLength - 4
                  )
              )
            : null;
    }
}

export interface RIFFListInfoEntryHandler {
    onName(value: string): void;
    onGenre(value: string): void;
    onArtist(value: string): void;
}

export class RIFFInfoList {
    constructor(private readonly contentView: DataView) {}

    /**
     * @returns [id, value, byteLength(full length of info entry)]
     */
    readEntryAt(offset: number): [string, string, number] {
        const byteLength = this.contentView.getUint32(offset + 4, true);
        const value = String.fromCharCode(
            ...Array.from({ length: byteLength })
                .map((_, o) => this.contentView.getUint8(offset + 8 + o))
                .filter((x) => x != 0)
        );

        return [unFourccLE(this.contentView.getUint32(offset + 0, true)), value, byteLength + 8];
    }

    readAllEntries(handler: RIFFListInfoEntryHandler) {
        let o = 0;
        while (o < this.contentView.byteLength) {
            const [id, value, fullLength] = this.readEntryAt(o);
            switch (id) {
                case "INAM":
                    handler.onName(value);
                    break;
                case "IGNR":
                    handler.onGenre(value);
                    break;
                case "IART":
                    handler.onArtist(value);
                    break;
                // default:
                //     console.warn("unhandled", id, value);
            }

            o = roundUpToWord(o + fullLength);
        }
    }
}

function roundUpToWord(x: number): number {
    return (x + 1) & ~1;
}
