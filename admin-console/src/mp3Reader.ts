export type ID3v1 = {
    readonly title: string;
    readonly artist: string;
    readonly genre: number;
};
export function tryParseID3v1(content: DataView): ID3v1 | null {
    if (content.byteLength < 128) return null;
    const tailRegion = new DataView(content.buffer, content.byteLength - 128, 128);

    const signature = (tailRegion.getUint8(0) << 16) | (tailRegion.getUint8(1) << 8) | tailRegion.getUint8(2);
    if (signature !== 0x00544147) return null;

    console.warn("TODO: ID3v1 tag detected. this is work-in-progress implementation");

    return {
        title: String.fromCharCode(...Array.from({ length: 30 }).map((_, o) => tailRegion.getUint8(3 + o))),
        artist: "",
        genre: 0,
    };
}

export class ID3v2Section {
    static tryRead(content: DataView): ID3v2Section | null {
        const signature = (content.getUint8(0) << 16) | (content.getUint8(1) << 8) | content.getUint8(2);
        if (signature !== 0x00494433) return null;

        const version = content.getUint16(3, false);
        const flags = content.getUint8(5);
        const size = readSyncSafeInteger(content, 6);

        const minorVersion = (version >> 8) & 0xff;
        if (minorVersion <= 2) {
            console.warn("ID3v2.2 is not supported");
        }

        return new ID3v2Section(
            minorVersion,
            version & 0xff,
            flags,
            size,
            new DataView(content.buffer, content.byteOffset + 10, size)
        );
    }

    constructor(
        readonly minorVersion: number,
        readonly patchVersion: number,
        readonly flags: number,
        readonly size: number,
        readonly content: DataView
    ) {}

    get useSyncSafeInteger(): boolean {
        return this.minorVersion >= 4;
    }

    /**
     * @returns entire bytes of the frame
     */
    readFrame(at: number, handler: ID3v2FrameHandler): number {
        const idNumber = this.content.getUint32(at + 0, true);
        const id = String.fromCharCode(
            idNumber & 0xff,
            (idNumber >> 8) & 0xff,
            (idNumber >> 16) & 0xff,
            (idNumber >> 24) & 0xff
        );
        const size = this.useSyncSafeInteger
            ? readSyncSafeInteger(this.content, at + 4)
            : this.content.getUint32(at + 4, false);
        const flags = this.content.getUint16(at + 8, false);
        const value = new DataView(this.content.buffer, this.content.byteOffset + at + 10, size);

        switch (id) {
            case "TIT2":
                handler.onTitle(readID3v2Text(value));
                break;
            case "TPE1":
                handler.onArtist(readID3v2Text(value));
                break;
            case "TCON":
                handler.onGenre(readID3v2Text(value));
                break;
            default:
                handler.onUnknown(id, flags, value);
        }

        return size + 10;
    }

    readAllFrames(handler: ID3v2FrameHandler): void {
        let offset = 0;

        while (offset < this.content.byteLength) {
            const entireFrameSize = this.readFrame(offset, handler);
            offset += entireFrameSize;
        }
    }
}

export interface ID3v2FrameHandler {
    onUnknown(id: string, flags: number, value: DataView): void;
    onTitle(title: string): void;
    onArtist(artist: string): void;
    onGenre(genre: string): void;
}

function readID3v2Text(content: DataView): string {
    const encoding = content.getUint8(0);
    const body = new DataView(content.buffer, content.byteOffset + 1, content.byteLength - 1);

    switch (encoding) {
        case 1:
            return new TextDecoder("utf-16", { ignoreBOM: false }).decode(body);
        case 2:
            return new TextDecoder("utf16-be", { ignoreBOM: true }).decode(body);
        case 3:
            return new TextDecoder("utf-8").decode(body);
        default:
            return new TextDecoder("iso8859-1").decode(body);
    }
}

function readSyncSafeInteger(dv: DataView, offset: number): number {
    const rawBytes = dv.getUint32(offset, false);

    // reinterpret
    const bs = [(rawBytes >>> 24) & 0x7f, (rawBytes >>> 16) & 0x7f, (rawBytes >>> 8) & 0x7f, rawBytes & 0x7f];
    return (bs[0] << 21) | (bs[1] << 14) | (bs[2] << 7) | bs[3];
}
