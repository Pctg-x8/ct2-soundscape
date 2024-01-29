use std::io::SeekFrom;

use tokio::io::{AsyncRead, AsyncSeek, AsyncSeekExt};

use self::{
    mp3_parser::{parse_id3v1, ID3v2FrameHandler, ID3v2FrameValue, ID3v2Section},
    riff_parser::{
        RIFFChunkHandler, RIFFFileHeader, RIFFListChunkHandler, RIFFListChunkReader,
        RIFFListInfoDataReader, RIFFListInfoEntryHandler, RIFFListInfoValue,
    },
};

mod mp3_parser;
mod riff_parser;

pub trait MetadataHandler {
    fn on_created_at(&mut self, created_at: time::Date);
    fn on_title(&mut self, title: String);
    fn on_artist(&mut self, artist: String);
    fn on_genre(&mut self, genre: String);
}
impl<H: MetadataHandler> MetadataHandler for &'_ mut H {
    fn on_created_at(&mut self, created_at: time::Date) {
        H::on_created_at(*self, created_at)
    }
    fn on_title(&mut self, title: String) {
        H::on_title(*self, title)
    }
    fn on_artist(&mut self, artist: String) {
        H::on_artist(*self, artist)
    }
    fn on_genre(&mut self, genre: String) {
        H::on_genre(*self, genre)
    }
}

pub struct RIFFChunkReader<H: MetadataHandler>(H);
impl<H: MetadataHandler> RIFFListInfoEntryHandler for RIFFChunkReader<H> {
    async fn on_name(
        &mut self,
        value: RIFFListInfoValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()> {
        self.0.on_title(value.read_as_str().await?);

        Ok(())
    }

    async fn on_artist(
        &mut self,
        value: RIFFListInfoValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()> {
        self.0.on_artist(value.read_as_str().await?);

        Ok(())
    }

    async fn on_genre(
        &mut self,
        value: RIFFListInfoValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()> {
        self.0.on_genre(value.read_as_str().await?);

        Ok(())
    }

    async fn on_unknown(
        &mut self,
        _id: riff_parser::Fourcc,
        value: RIFFListInfoValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()> {
        // skip
        value.skip().await?;
        Ok(())
    }
}
impl<H: MetadataHandler + Unpin> RIFFListChunkHandler for RIFFChunkReader<H> {
    async fn on_info(
        &mut self,
        reader: RIFFListInfoDataReader<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()> {
        reader.read_all(self).await
    }

    async fn on_unknown(
        &mut self,
        reader: &mut (impl AsyncRead + AsyncSeek + Unpin),
        _ty: riff_parser::Fourcc,
        rest_byte_length: u32,
    ) -> std::io::Result<()> {
        // skip
        reader
            .seek(SeekFrom::Current(rest_byte_length as _))
            .await?;

        Ok(())
    }
}
impl<H: MetadataHandler + Unpin> RIFFChunkHandler for RIFFChunkReader<H> {
    async fn on_list(
        &mut self,
        reader: RIFFListChunkReader<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()> {
        reader.read_and_dispatch_type(self).await
    }

    async fn on_unknown(
        &mut self,
        reader: &mut (impl AsyncRead + AsyncSeek + Unpin),
        _id: riff_parser::Fourcc,
        byte_length: u32,
    ) -> std::io::Result<()> {
        // println!("unknown chunk id: {:?}", riff_parser::un_fourcc(&id));
        // skip processing
        reader.seek(SeekFrom::Current(byte_length as _)).await?;

        Ok(())
    }
}

struct ID3v2FrameReceiver<H: MetadataHandler>(H);
impl<H: MetadataHandler> ID3v2FrameHandler for ID3v2FrameReceiver<H> {
    async fn on_artist(
        &mut self,
        value: ID3v2FrameValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()> {
        self.0.on_artist(value.read_as_text().await?);
        Ok(())
    }

    async fn on_genre(
        &mut self,
        value: ID3v2FrameValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()> {
        self.0.on_genre(value.read_as_text().await?);
        Ok(())
    }

    async fn on_title(
        &mut self,
        value: ID3v2FrameValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()> {
        self.0.on_title(value.read_as_text().await?);
        Ok(())
    }

    async fn on_unknown(
        &mut self,
        _id: [u8; 4],
        _flags: u16,
        value: ID3v2FrameValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()> {
        // unknown
        value.skip().await?;
        Ok(())
    }
}

pub async fn parse_file_metadata(
    path: &std::path::Path,
    handler: &mut impl MetadataHandler,
) -> std::io::Result<()> {
    let blob = tokio::fs::File::open(path).await?;

    let created_at = time::OffsetDateTime::from(blob.metadata().await?.created()?).date();
    handler.on_created_at(created_at);

    let mut reader = tokio::io::BufReader::new(blob);
    if RIFFFileHeader::read(&mut reader)
        .await?
        .is_some_and(|h| h.is_wave())
    {
        // riff wave
        riff_parser::read_chunk_all(&mut reader, &mut RIFFChunkReader(handler)).await?;
        return Ok(());
    }

    if parse_id3v1(&mut reader).await?.is_some() {
        println!("mp3 with idv1 but here is not reachable");
        return Ok(());
    }

    reader.seek(SeekFrom::Start(0)).await?;
    if let Some(v2s) = ID3v2Section::read(&mut reader).await? {
        // println!("id3v2 {} {}", v2s.minor_version, v2s.size);
        v2s.read_all(&mut reader, &mut ID3v2FrameReceiver(handler))
            .await?;
        return Ok(());
    }

    Ok(())
}
