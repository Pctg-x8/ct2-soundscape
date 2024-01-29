use futures::StreamExt;
use jwt_validator::ClaimValidator;
use wasm_bindgen::JsValue;
use worker::{
    console_error, console_log, event, Bucket, ByteStream, Context, D1Database, D1Result, Env,
    HttpMetadata, MultipartUpload, Request, Response, RouteContext, Router,
};

mod license;
use license::License;

pub struct ContentIDObfuscator([u8; 10]);
impl ContentIDObfuscator {
    pub fn from_hex_string(master_key: &str) -> Result<Self, hex::FromHexError> {
        let mut sink = [0u8; 10];
        hex::decode_to_slice(master_key, &mut sink)?;
        Ok(Self::new(sink))
    }

    pub const fn new(master_key: [u8; 10]) -> Self {
        Self(master_key)
    }

    pub fn obfuscate(&self, id: u32) -> u32 {
        skip32::encode(&self.0, id)
    }

    pub fn deobfuscate(&self, id: u32) -> u32 {
        skip32::decode(&self.0, id)
    }
}

#[repr(transparent)]
pub struct AppContext(pub RouteContext<()>);
impl AppContext {
    pub const fn new(ctx: RouteContext<()>) -> Self {
        Self(ctx)
    }

    pub fn info_store(&self) -> worker::Result<D1Database> {
        self.0.d1("INFO_STORE")
    }

    pub fn object_store(&self) -> worker::Result<Bucket> {
        self.0.bucket("OBJECT_STORE")
    }

    pub fn content_id_obfuscator(&self) -> worker::Result<ContentIDObfuscator> {
        ContentIDObfuscator::from_hex_string(
            &self.0.secret("CONTENT_ID_OBFUSCATOR_KEY")?.to_string(),
        )
        .map_err(|e| worker::Error::RustError(e.to_string()))
    }
}

#[derive(serde::Serialize)]
pub struct ListItem {
    pub id: u32,
    pub internal_id: u32,
    pub title: String,
    pub artist: String,
    pub genre: String,
    pub created_year: u16,
    pub created_month: u8,
    pub created_day: u8,
    pub license_str: String,
    pub download_count: u32,
}
impl ListItem {
    pub async fn fetch_all(
        repository: &D1Database,
        id_obfuscator: &ContentIDObfuscator,
    ) -> Result<Vec<Self>, worker::Error> {
        #[derive(serde::Deserialize, Debug)]
        struct Row {
            id: u32,
            title: String,
            artist: String,
            genre: String,
            year: u32,
            month: u32,
            day: u32,
            license_type: u32,
            license_text: Option<String>,
            download_count: u32,
        }
        let r = repository.prepare("Select id, title, artist, genre, year, month, day, license_type, license_text, download_count from details").all().await?;
        if let Some(e) = r.error() {
            return Err(worker::Error::RustError(e));
        }

        Ok(r.results::<Row>()?
            .into_iter()
            .map(|r| Self {
                id: id_obfuscator.obfuscate(r.id),
                internal_id: r.id,
                title: r.title,
                artist: r.artist,
                genre: r.genre,
                created_year: r.year as _,
                created_month: r.month as _,
                created_day: r.day as _,
                license_str: License::from_db_values(r.license_type, r.license_text.as_deref())
                    .to_string(),
                download_count: r.download_count,
            })
            .collect())
    }
}

async fn fetch_list(ctx: AppContext) -> worker::Result<Response> {
    match ListItem::fetch_all(&ctx.info_store()?, &ctx.content_id_obfuscator()?).await {
        Ok(xs) => Response::from_json(&xs),
        Err(e) => {
            console_error!("failed to fetch entries: {e:?}");
            Response::error("Internal Server Error", 500)
        }
    }
}

async fn put_item(mut req: Request, ctx: AppContext) -> worker::Result<Response> {
    let Ok(year) = ctx
        .0
        .param("year")
        .expect("pattern mismatch")
        .parse::<u16>()
    else {
        return Response::error("invalid year input", 400);
    };
    let Ok(month) = ctx
        .0
        .param("month")
        .expect("pattern mismatch")
        .parse::<u8>()
    else {
        return Response::error("invalid month input", 400);
    };
    let Ok(day) = ctx.0.param("day").expect("pattern mismatch").parse::<u8>() else {
        return Response::error("invalid day input", 400);
    };

    let Ok(artist) = urlencoding::decode(ctx.0.param("artist").expect("pattern mismatch")) else {
        return Response::error("invalid encoded artist", 400);
    };
    let Ok(title) = urlencoding::decode(ctx.0.param("title").expect("pattern mismatch")) else {
        return Response::error("invalid encoded title", 400);
    };

    let url = req.url()?;
    let (mut genre, mut license) = (None, License::Custom("All rights reserved"));
    for (k, v) in url.query_pairs() {
        if k == "genre" {
            genre = Some(
                urlencoding::decode(&v)
                    .map_err(|e| worker::Error::RustError(format!("invalid genre input: {e:?}")))?
                    .into_owned(),
            );
        }
        if k == "lic" {
            let parsed = urlencoding::decode(&v)
                .map_err(|e| worker::Error::RustError(format!("invalid license input: {e:?}")))?;
            license = match &parsed as &str {
                "cc0" => License::PublicDomain,
                "cc-by" => License::CreativeCommonsBY,
                "cc-by-sa" => License::CreativeCommonsBY_SA,
                "cc-by-nc" => License::CreativeCommonsBY_NC,
                "cc-by-nd" => License::CreativeCommonsBY_ND,
                "cc-by-nc-sa" => License::CreativeCommonsBY_NC_SA,
                "cc-by-nc-nd" => License::CreativeCommonsBY_NC_ND,
                _ => License::CustomOwned(parsed.into_owned()),
            }
        }
    }
    let Some(genre) = genre else {
        return Response::error("genre is mandatory", 400);
    };

    console_log!(
        "Incoming put request: [{genre}] {artist} - {title} created at {year}/{month}/{day} licensed with {license}"
    );

    let Some(content_type) = req.headers().get("content-type").unwrap() else {
        return Response::error("content-type is mandatory", 400);
    };
    console_log!(
        "Content: {} length: {:?}",
        content_type,
        req.headers().get("content-length").unwrap()
    );

    let body = req.stream()?;

    let info_store = ctx.info_store()?;
    let object_store = ctx.object_store()?;
    let id_obfuscator = ctx.content_id_obfuscator()?;

    let (license_type, license_text) = license.into_db_values();
    let new_id = info_store.prepare("Insert into details (title, artist, genre, year, month, day, license_type, license_text) values (?, ?, ?, ?, ?, ?, ?, ?) returning id").bind(&[JsValue::from_str(&title), JsValue::from_str(&artist), genre.into(), year.into(), month.into(), day.into(), license_type.into(), license_text.as_deref().map_or(JsValue::NULL, JsValue::from_str)])?.first::<u32>(Some("id")).await?.expect("nothing inserted?");

    async fn upload_object(
        mut provider: ByteStream,
        receiver: MultipartUpload,
    ) -> worker::Result<()> {
        const TEMP_BUFFERING_BYTES: usize = 10 * 1048576;

        let mut receive_length = 0;
        let mut part_number = 1;
        let mut parts = Vec::new();
        let mut temp_buffer = Vec::with_capacity(TEMP_BUFFERING_BYTES);
        while let Some(b) = provider.next().await {
            let b = b?;
            receive_length += b.len();
            temp_buffer.extend(b);
            if temp_buffer.len() >= TEMP_BUFFERING_BYTES {
                parts.push(
                    receiver
                        .upload_part(
                            part_number,
                            std::mem::replace(
                                &mut temp_buffer,
                                Vec::with_capacity(TEMP_BUFFERING_BYTES),
                            ),
                        )
                        .await?,
                );
                console_log!("transfer #{part_number} {receive_length}");
                part_number += 1;
            }
        }
        if !temp_buffer.is_empty() {
            // のこり
            parts.push(
                receiver
                    .upload_part(
                        part_number,
                        std::mem::replace(
                            &mut temp_buffer,
                            Vec::with_capacity(TEMP_BUFFERING_BYTES),
                        ),
                    )
                    .await?,
            );
            console_log!("transfer #{part_number} {receive_length}");
        }

        receiver.complete(parts).await?;
        Ok(())
    }

    let object_uploader = object_store
        .create_multipart_upload(new_id.to_string())
        .http_metadata(HttpMetadata {
            content_type: Some(content_type),
            ..HttpMetadata::default()
        })
        .execute()
        .await?;
    if let Err(e) = upload_object(body, object_uploader).await {
        let rollback_result = info_store
            .prepare("Delete from details where id=?")
            .bind(&[new_id.into()])?
            .run()
            .await?;
        if let Some(e) = rollback_result.error() {
            panic!("rollback failed! {e:?}");
        }

        return Err(worker::Error::RustError(format!(
            "registering was cancelled: {e:?}"
        )));
    }

    Response::ok(id_obfuscator.obfuscate(new_id).to_string())
}

#[derive(serde::Deserialize)]
struct DetailsRow {
    pub id: u32,
    pub artist: String,
    pub title: String,
    pub genre: String,
    pub year: u32,
    pub month: u32,
    pub day: u32,
    pub comment: String,
    pub download_count: u32,
    pub license_type: u32,
    pub license_text: Option<String>,
}
impl DetailsRow {
    pub async fn insert(&self, db: &D1Database) -> worker::Result<D1Result> {
        db.prepare("Insert into details (id, artist, title, genre, year, month, day, comment, download_count, license_type, license_text) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(&[
            self.id.into(),
            JsValue::from_str(&self.artist),
            JsValue::from_str(&self.title),
            JsValue::from_str(&self.genre),
            self.year.into(),
            self.month.into(),
            self.day.into(),
            JsValue::from_str(&self.comment),
            self.download_count.into(),
            self.license_type.into(),
            self.license_text.as_deref().map_or(JsValue::NULL, JsValue::from_str)
        ])?.run().await
    }
}

async fn delete_content(req: Request, ctx: AppContext) -> worker::Result<Response> {
    let Ok(id) = ctx.0.param("id").expect("pattern mismatch").parse::<u32>() else {
        return Response::error("invalid content id", 400);
    };

    let url = req.url()?;
    let mut force = false;
    for (k, _) in url.query_pairs() {
        if k == "force" {
            force = true;
        }
    }

    let info_store = ctx.info_store()?;
    let object_store = ctx.object_store()?;
    let content_id_obfuscator = ctx.content_id_obfuscator()?;

    let internal_id = content_id_obfuscator.deobfuscate(id);
    let preserved_record = info_store
        .prepare("Delete from details where id=? returning *")
        .bind(&[internal_id.into()])?
        .first::<DetailsRow>(None)
        .await?;
    if preserved_record.is_none() && !force {
        return Response::error("content not found", 404);
    }

    if let Err(e) = object_store.delete(internal_id.to_string()).await {
        if let Some(r) = preserved_record {
            r.insert(&info_store).await?;
        }

        return Err(worker::Error::RustError(format!(
            "deleting content was cancelled: {e:?}"
        )));
    }

    Response::empty()
}

async fn verify_request(req: &Request) -> worker::Result<Option<Response>> {
    let Some(auth) = req.headers().get("authorization").unwrap() else {
        return Response::error("", 403).map(Some);
    };
    let Some(auth_body) = auth.strip_prefix("Token ") else {
        return Response::error("", 403).map(Some);
    };

    let tenancy = auth0::Tenancy::from_domain("ct2.jp.auth0.com").expect("invalid url?");
    let app = auth0::APIServerApplication {
        tenancy: &tenancy,
        audience: "https://ach.sound.ct2.io/",
    };
    let cv = jwt_validator::TimeAvailabilityValidator::for_now().and(app);
    if let Err(e) = jwt_validator::validate(&auth_body, &tenancy, &cv).await {
        console_error!("request verification failed: {e:?}");
        return Response::error("", 403).map(Some);
    }

    Ok(None)
}

#[event(fetch)]
pub async fn fetch(req: Request, env: Env, _ctx: Context) -> worker::Result<Response> {
    std::panic::set_hook(Box::new(|x| console_error!("panicked: {x:?}")));

    if let Some(resp) = verify_request(&req).await? {
        return Ok(resp);
    }

    Router::new()
        .get_async("/", |_, ctx| fetch_list(AppContext::new(ctx)))
        .put_async("/:year/:month/:day/:artist/:title", |req, ctx| {
            put_item(req, AppContext::new(ctx))
        })
        .delete_async("/content/:id", |req, ctx| {
            delete_content(req, AppContext::new(ctx))
        })
        .run(req, env)
        .await
}
