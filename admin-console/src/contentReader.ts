import { ID3v2Section, tryParseID3v1 } from "./mp3Reader";
import { RIFFChunk, isRIFFWave } from "./riffReader";

export interface ContentMetadataHandler {
    onLastModifiedDate(value: Date): void;
    onTitle(value: string): void;
    onArtist(value: string): void;
    onGenre(value: string): void;
}

export async function readFileMetadata(file: File, handler: ContentMetadataHandler): Promise<void> {
    handler.onLastModifiedDate(new Date(file.lastModified));

    const content = await file.arrayBuffer();

    if (isRIFFWave(new DataView(content, 0))) {
        RIFFChunk.readAll(new DataView(content, 12), {
            onUnknown(c) {
                console.debug("unknown chunk", c.id);
            },
            onList(c) {
                const infoList = c.tryConvertToInfoList();
                if (!infoList) return;

                infoList.readAllEntries({
                    onName: handler.onTitle.bind(handler),
                    onArtist: handler.onArtist.bind(handler),
                    onGenre: handler.onGenre.bind(handler),
                });
            },
        });
    }

    const id3v1 = tryParseID3v1(new DataView(content));
    if (id3v1) {
        handler.onTitle(id3v1.title);
        handler.onArtist(id3v1.artist);
        // TODO: マッピングが謎
        handler.onGenre(id3v1.genre.toString());
    }

    ID3v2Section.tryRead(new DataView(content))?.readAllFrames({
        onUnknown(id, flags, value) {
            // console.debug(
            //     "unknown id3v2 tag",
            //     id,
            //     Array.from({ length: value.byteLength }).map((_, o) => value.getUint8(o))
            // );
        },
        onTitle: handler.onTitle.bind(handler),
        onArtist: handler.onArtist.bind(handler),
        onGenre: handler.onGenre.bind(handler),
    });
}
