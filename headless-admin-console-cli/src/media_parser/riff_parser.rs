use std::io::SeekFrom;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt};

pub type Fourcc = [u8; 4];
const EMPTY_FOURCC: Fourcc = [0u8; 4];
// pub fn un_fourcc(fcc: &Fourcc) -> &str {
//     unsafe { std::str::from_utf8_unchecked(fcc) }
// }

pub struct RIFFFileHeader {
    pub signature: Fourcc,
    pub chunk_size: u32,
    pub format: Fourcc,
}
impl RIFFFileHeader {
    pub async fn read(reader: &mut (impl AsyncRead + Unpin)) -> std::io::Result<Option<Self>> {
        let mut signature = EMPTY_FOURCC;
        reader.read_exact(&mut signature).await?;
        if &signature != b"RIFF" {
            return Ok(None);
        }

        let mut rest_bytes = [0u8; 8];
        reader.read_exact(&mut rest_bytes).await?;
        Ok(Some(Self {
            signature,
            chunk_size: u32::from_le_bytes([
                rest_bytes[0],
                rest_bytes[1],
                rest_bytes[2],
                rest_bytes[3],
            ]),
            format: [rest_bytes[4], rest_bytes[5], rest_bytes[6], rest_bytes[7]],
        }))
    }

    pub fn is_wave(&self) -> bool {
        &self.format == b"WAVE"
    }
}

pub trait RIFFChunkHandler {
    async fn on_list(
        &mut self,
        reader: RIFFListChunkReader<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()>;

    async fn on_unknown(
        &mut self,
        reader: &mut (impl AsyncRead + AsyncSeek + Unpin),
        id: Fourcc,
        byte_length: u32,
    ) -> std::io::Result<()>;
}

pub async fn read_chunk_all(
    reader: &mut (impl AsyncRead + AsyncSeek + Unpin),
    handler: &mut (impl RIFFChunkHandler + Unpin),
) -> std::io::Result<()> {
    loop {
        let header = match RIFFChunkHeader::read(reader).await {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break Ok(()),
            Err(e) => break Err(e),
        };

        match header.id {
            RIFFChunkHeader::ID_LIST => {
                handler
                    .on_list(RIFFListChunkReader {
                        reader,
                        byte_length: header.byte_length,
                    })
                    .await?
            }
            _ => {
                handler
                    .on_unknown(reader, header.id, header.byte_length)
                    .await?
            }
        }
    }
}

pub struct RIFFChunkHeader {
    pub id: Fourcc,
    pub byte_length: u32,
}
impl RIFFChunkHeader {
    pub const ID_LIST: Fourcc = *b"LIST";

    pub async fn read(reader: &mut (impl AsyncRead + Unpin)) -> std::io::Result<Self> {
        let mut bytes = [0u8; 8];
        reader.read_exact(&mut bytes).await?;

        Ok(Self {
            id: [bytes[0], bytes[1], bytes[2], bytes[3]],
            byte_length: u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]),
        })
    }

    #[allow(dead_code)]
    pub async fn skip_content(&self, reader: &mut (impl AsyncSeek + Unpin)) -> std::io::Result<()> {
        reader
            .seek(SeekFrom::Current(self.byte_length as i64))
            .await?;
        Ok(())
    }
}

pub trait RIFFListChunkHandler {
    async fn on_info(
        &mut self,
        reader: RIFFListInfoDataReader<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()>;
    async fn on_unknown(
        &mut self,
        reader: &mut (impl AsyncRead + AsyncSeek + Unpin),
        ty: Fourcc,
        rest_byte_length: u32,
    ) -> std::io::Result<()>;
}

pub struct RIFFListInfoDataReader<'r, R: 'r + AsyncRead + AsyncSeek> {
    reader: &'r mut R,
    byte_length: u32,
}
impl<'r, R> RIFFListInfoDataReader<'r, R>
where
    R: 'r + AsyncRead + AsyncSeek + Unpin,
{
    pub async fn read_next<'s>(
        &'s mut self,
    ) -> std::io::Result<Option<(Fourcc, RIFFListInfoValue<'s, R>)>>
    where
        'r: 's,
    {
        if self.byte_length <= 0 {
            return Ok(None);
        }

        let hdr = RIFFListInfoEntry::read_header(&mut self.reader).await?;
        let value = RIFFListInfoValue {
            reader: self.reader,
            byte_length: hdr.byte_length,
        };

        self.byte_length -= hdr.total_bytes();
        Ok(Some((hdr.id, value)))
    }

    pub async fn read_all(
        mut self,
        handler: &mut impl RIFFListInfoEntryHandler,
    ) -> std::io::Result<()> {
        while let Some((id, value)) = self.read_next().await? {
            match id {
                RIFFListInfoEntry::ID_NAME => handler.on_name(value).await?,
                RIFFListInfoEntry::ID_GENRE => handler.on_genre(value).await?,
                RIFFListInfoEntry::ID_ARTIST => handler.on_artist(value).await?,
                id => handler.on_unknown(id, value).await?,
            }
        }

        Ok(())
    }
}

pub struct RIFFListChunkReader<'r, R: 'r + AsyncRead + AsyncSeek> {
    reader: &'r mut R,
    byte_length: u32,
}
impl<'r, R> RIFFListChunkReader<'r, R>
where
    R: 'r + AsyncRead + AsyncSeek + Unpin,
{
    pub const TYPE_INFO: Fourcc = *b"INFO";

    pub async fn read_and_dispatch_type(
        self,
        handler: &mut impl RIFFListChunkHandler,
    ) -> std::io::Result<()> {
        let mut ty = EMPTY_FOURCC;
        self.reader.read_exact(&mut ty).await?;

        match ty {
            Self::TYPE_INFO => {
                handler
                    .on_info(RIFFListInfoDataReader {
                        reader: self.reader,
                        byte_length: self.byte_length - 4,
                    })
                    .await
            }
            ty => {
                handler
                    .on_unknown(self.reader, ty, self.byte_length - 4)
                    .await
            }
        }
    }
}

pub trait RIFFListInfoEntryHandler {
    async fn on_name(
        &mut self,
        value: RIFFListInfoValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()>;
    async fn on_artist(
        &mut self,
        value: RIFFListInfoValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()>;
    async fn on_genre(
        &mut self,
        value: RIFFListInfoValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()>;
    async fn on_unknown(
        &mut self,
        id: Fourcc,
        value: RIFFListInfoValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()>;
}

pub async fn read_list_info_entry_value_str(
    reader: &mut (impl AsyncRead + Unpin),
    byte_length: u32,
) -> std::io::Result<String> {
    let mut bytes = Vec::with_capacity(byte_length as _);
    unsafe {
        bytes.set_len(byte_length as _);
    }

    reader.read_exact(&mut bytes).await?;
    Ok(encoding_rs::SHIFT_JIS
        .decode(&bytes)
        .0
        .trim_end_matches('\0')
        .to_string())
}

pub struct RIFFListInfoValue<'r, R: 'r + AsyncRead + AsyncSeek + Unpin> {
    reader: &'r mut R,
    byte_length: u32,
}
impl<'r, R> RIFFListInfoValue<'r, R>
where
    R: 'r + AsyncRead + AsyncSeek + Unpin,
{
    pub async fn skip(self) -> std::io::Result<()> {
        self.reader
            .seek(SeekFrom::Current(self.byte_length as _))
            .await?;
        Ok(())
    }

    pub async fn read_as_str(self) -> std::io::Result<String> {
        read_list_info_entry_value_str(self.reader, self.byte_length).await
    }
}

pub struct RIFFListInfoEntry {
    pub id: Fourcc,
    pub byte_length: u32,
}
impl RIFFListInfoEntry {
    pub const ID_NAME: Fourcc = *b"INAM";
    pub const ID_GENRE: Fourcc = *b"IGNR";
    pub const ID_ARTIST: Fourcc = *b"IART";

    pub const fn total_bytes(&self) -> u32 {
        self.byte_length + 8
    }

    pub async fn read_header(
        reader: &mut (impl AsyncRead + Unpin),
    ) -> std::io::Result<RIFFListInfoEntry> {
        let mut bytes = [0u8; 8];
        reader.read_exact(&mut bytes).await?;

        Ok(Self {
            id: [bytes[0], bytes[1], bytes[2], bytes[3]],
            byte_length: round_up_to_word_boundary(u32::from_le_bytes([
                bytes[4], bytes[5], bytes[6], bytes[7],
            ])),
        })
    }

    // pub async fn skip_value(&self, reader: &mut (impl AsyncSeek + Unpin)) -> std::io::Result<()> {
    //     reader
    //         .seek(SeekFrom::Current(self.byte_length as _))
    //         .await?;
    //     Ok(())
    // }

    // pub async fn read_value(
    //     &self,
    //     reader: &mut (impl AsyncRead + Unpin),
    // ) -> std::io::Result<Vec<u8>> {
    //     let mut buffer = Vec::with_capacity(self.byte_length as _);
    //     unsafe {
    //         buffer.set_len(self.byte_length as _);
    //     }
    //     reader.read_exact(&mut buffer).await?;

    //     Ok(buffer)
    // }
}

const fn round_up_to_word_boundary(x: u32) -> u32 {
    (x + 1) & !1
}
