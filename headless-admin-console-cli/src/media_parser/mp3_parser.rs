use std::io::SeekFrom;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt};

pub async fn parse_id3v1(
    reader: &mut (impl AsyncRead + AsyncSeek + Unpin),
) -> std::io::Result<Option<()>> {
    reader.seek(SeekFrom::End(-128)).await?;

    let mut signature = [0u8; 3];
    reader.read_exact(&mut signature).await?;
    if signature != *b"TAG" {
        return Ok(None);
    }

    unimplemented!("id3v1 detected but not implemented");
}

pub trait ID3v2FrameHandler {
    async fn on_unknown(
        &mut self,
        id: [u8; 4],
        flags: u16,
        value: ID3v2FrameValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()>;
    async fn on_title(
        &mut self,
        value: ID3v2FrameValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()>;
    async fn on_artist(
        &mut self,
        value: ID3v2FrameValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()>;
    async fn on_genre(
        &mut self,
        value: ID3v2FrameValue<'_, impl AsyncRead + AsyncSeek + Unpin>,
    ) -> std::io::Result<()>;
}

pub struct ID3v2Section {
    pub minor_version: u8,
    pub patch_version: u8,
    pub flags: u8,
    pub size: u32,
}
impl ID3v2Section {
    const ID_TITLE: [u8; 4] = *b"TIT2";
    const ID_ARTIST: [u8; 4] = *b"TPE1";
    const ID_GENRE: [u8; 4] = *b"TCON";

    pub async fn read(reader: &mut (impl AsyncRead + Unpin)) -> std::io::Result<Option<Self>> {
        let mut signature = [0u8; 3];
        reader.read_exact(&mut signature).await?;
        if signature != *b"ID3" {
            return Ok(None);
        }

        let mut header_values = [0u8; 3];
        reader.read_exact(&mut header_values).await?;
        let [minor_version, patch_version, flags] = header_values;
        let size = read_sync_safe_integer(reader).await?;

        if minor_version <= 2 {
            eprintln!("Warn: ID3v2.2 is not supported");
        }

        Ok(Some(Self {
            minor_version,
            patch_version,
            flags,
            size,
        }))
    }

    pub const fn use_sync_safe_integer(&self) -> bool {
        self.minor_version >= 4
    }

    async fn read_int(&self, reader: &mut (impl AsyncRead + Unpin)) -> std::io::Result<u32> {
        if self.use_sync_safe_integer() {
            read_sync_safe_integer(reader).await
        } else {
            let mut bytes = [0u8; 4];
            reader.read_exact(&mut bytes).await?;
            Ok(u32::from_be_bytes(bytes))
        }
    }

    /// returns read byte length
    pub async fn read_frame(
        &self,
        reader: &mut (impl AsyncRead + AsyncSeek + Unpin),
        handler: &mut impl ID3v2FrameHandler,
    ) -> std::io::Result<u32> {
        let mut id = [0u8; 4];
        reader.read_exact(&mut id).await?;
        let size = self.read_int(reader).await?;
        let mut flags = [0u8; 2];
        reader.read_exact(&mut flags).await?;
        let flags = u16::from_le_bytes(flags);
        let value = ID3v2FrameValue {
            reader,
            byte_length: size,
        };

        match id {
            Self::ID_TITLE => handler.on_title(value).await?,
            Self::ID_ARTIST => handler.on_artist(value).await?,
            Self::ID_GENRE => handler.on_genre(value).await?,
            _ => handler.on_unknown(id, flags, value).await?,
        }

        Ok(size + 10)
    }

    pub async fn read_all(
        &self,
        reader: &mut (impl AsyncRead + AsyncSeek + Unpin),
        handler: &mut impl ID3v2FrameHandler,
    ) -> std::io::Result<()> {
        let mut offset = 0;

        while offset < self.size {
            let entire_frame_size = self.read_frame(reader, handler).await?;
            offset += entire_frame_size;
        }

        Ok(())
    }
}

pub struct ID3v2FrameValue<'r, R: 'r + AsyncRead + AsyncSeek> {
    reader: &'r mut R,
    byte_length: u32,
}
impl<'r, R> ID3v2FrameValue<'r, R>
where
    R: 'r + AsyncRead + AsyncSeek + Unpin,
{
    pub async fn read_as_text(self) -> std::io::Result<String> {
        let mut encoding = [0u8; 1];
        self.reader.read_exact(&mut encoding).await?;
        let mut bytes = Vec::with_capacity(self.byte_length as usize - 1);
        unsafe {
            bytes.set_len(self.byte_length as usize - 1);
        }
        self.reader.read_exact(&mut bytes).await?;

        match encoding[0] {
            1 => Ok(encoding_rs::UTF_16LE.decode(&bytes).0.into_owned()),
            2 => Ok(encoding_rs::UTF_16BE.decode(&bytes).0.into_owned()),
            3 => Ok(encoding_rs::UTF_8.decode(&bytes).0.into_owned()),
            // Note: ほんとうはiso8859-1が正解（Windowsはここで仕様無視してshift-jisを入れてくる）
            _ => Ok(encoding_rs::SHIFT_JIS.decode(&bytes).0.into_owned()),
        }
    }

    pub async fn skip(self) -> std::io::Result<()> {
        self.reader
            .seek(SeekFrom::Current(self.byte_length as _))
            .await?;
        Ok(())
    }
}

async fn read_sync_safe_integer(reader: &mut (impl AsyncRead + Unpin)) -> std::io::Result<u32> {
    let mut raw_bytes = [0u8; 4];
    reader.read_exact(&mut raw_bytes).await?;

    // reinterpret
    let (b0, b1, b2, b3) = (
        raw_bytes[0] & 0x7f,
        raw_bytes[1] & 0x7f,
        raw_bytes[2] & 0x7f,
        raw_bytes[3] & 0x7f,
    );
    Ok((b0 as u32) << 21 | (b1 as u32) << 14 | (b2 as u32) << 7 | b3 as u32)
}
