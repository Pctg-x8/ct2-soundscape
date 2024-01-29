use clap::Parser;
use mime_guess::mime::APPLICATION_OCTET_STREAM;
use tokio_util::io::{InspectReader, ReaderStream};

mod creation_date;
mod errorable;
mod media_parser;
use creation_date::CreationDate;
use url::Url;

use jwt_validator::{ClaimValidator, TimeAvailabilityValidator};

#[derive(Parser)]
struct DescribeMediaArgs {
    pub media_path: std::path::PathBuf,
}

#[derive(Parser)]
struct UploadArgs {
    pub media_path: std::path::PathBuf,
    /// specify for actual run
    #[clap(default_value = "false", short = 'n')]
    pub no_dry_run: bool,
    #[clap(long, short = 't')]
    pub title: Option<String>,
    #[clap(long, short = 'a')]
    pub artist: Option<String>,
    #[clap(long, short = 'g')]
    pub genre: Option<String>,
    /// creation date: formed in YYYY-MM-DD
    #[clap(long, short = 'c')]
    pub created_at: Option<CreationDate>,
    /// license type: cc0, cc-by, cc-by-sa, cc-by-nc, cc-by-nd, cc-by-nc-sa, cc-by-nc-nd are special case
    #[clap(long, short = 'l')]
    pub license: String,
}
impl UploadArgs {
    pub fn needs_autofill(&self) -> bool {
        self.title.is_none()
            || self.artist.is_none()
            || self.genre.is_none()
            || self.created_at.is_none()
    }
}

#[derive(Parser)]
struct DeleteArgs {
    pub id: u32,
    /// specify for actual run
    #[clap(default_value = "false", short = 'n')]
    pub no_dry_run: bool,
    /// ignores not-found error
    #[clap(default_value = "false", short = 'f')]
    pub force: bool,
}

#[derive(Parser)]
enum Commands {
    DescribeMedia(DescribeMediaArgs),
    List,
    Upload(UploadArgs),
    Delete(DeleteArgs),
}

#[derive(Parser)]
struct Args {
    /// url of the headless admin console: default is production url
    #[clap(long)]
    server_url: Option<Url>,
    #[clap(subcommand)]
    commands: Commands,
}

struct MediaPropertyCollector {
    pub created_at: Option<time::Date>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub genre: Option<String>,
}
impl MediaPropertyCollector {
    pub fn new() -> Self {
        Self {
            created_at: None,
            title: None,
            artist: None,
            genre: None,
        }
    }
}
impl media_parser::MetadataHandler for MediaPropertyCollector {
    fn on_created_at(&mut self, created_at: time::Date) {
        self.created_at = Some(created_at);
    }

    fn on_title(&mut self, title: String) {
        self.title = Some(title);
    }

    fn on_artist(&mut self, artist: String) {
        self.artist = Some(artist);
    }

    fn on_genre(&mut self, genre: String) {
        self.genre = Some(genre);
    }
}

async fn describe_media(args: DescribeMediaArgs) {
    println!("describing media: {}", args.media_path.display());

    let mut collector = MediaPropertyCollector::new();
    media_parser::parse_file_metadata(&args.media_path, &mut collector)
        .await
        .expect("Failed to parse media");

    if let Some(x) = collector.created_at {
        println!(
            "* created_at = {}-{}-{}",
            x.year(),
            x.month() as u8,
            x.day()
        );
    }
    println!("* title = {}", collector.title.as_deref().unwrap_or("???"));
    println!(
        "* artist = {}",
        collector.artist.as_deref().unwrap_or("???")
    );
    println!("* genre = {}", collector.genre.as_deref().unwrap_or("???"));
}

async fn upload(server_base: Url, mut args: UploadArgs) {
    if args.needs_autofill() {
        let mut collector = MediaPropertyCollector::new();
        media_parser::parse_file_metadata(&args.media_path, &mut collector)
            .await
            .expect("Failed to collect media props");
        args.title = args.title.or(collector.title);
        args.artist = args.artist.or(collector.artist);
        args.genre = args.genre.or(collector.genre);
        args.created_at = args
            .created_at
            .or(collector.created_at.map(CreationDate::from));
    }

    let title = args.title.expect("title is not specified");
    let artist = args.artist.expect("artist is not specified");
    let genre = args.genre.expect("genre is not specified");
    let creation_date = args.created_at.expect("created_at is not specified");
    let content_type = mime_guess::from_path(&args.media_path).first_or(APPLICATION_OCTET_STREAM);

    println!("Media Properties:");
    println!("* Title: {title}");
    println!("* Artist: {artist}");
    println!("* Genre: {genre}");
    println!(
        "* Created At: {}-{}-{}",
        creation_date.year(),
        creation_date.month(),
        creation_date.day()
    );
    println!("* License: {}", args.license);
    println!("* Content-Type: {}", content_type.as_ref());

    let mut url = server_base;
    url.path_segments_mut().expect("can be base").extend([
        creation_date.year().to_string(),
        creation_date.month().to_string(),
        creation_date.day().to_string(),
        artist,
        title,
    ]);
    url.query_pairs_mut()
        .append_pair("genre", &genre)
        .append_pair("lic", &args.license);

    println!("requesting: {url}");

    if !args.no_dry_run {
        println!("* This run is dry-run. To execute actual uploading, pass `-n`");
        return;
    }

    let upload_body = tokio::fs::File::open(&args.media_path)
        .await
        .expect("Failed to open uploaded file");
    let file_length = upload_body
        .metadata()
        .await
        .expect("Failed to get file meta")
        .len();
    let mut total_read = 0;
    print!("uploading...");
    let upload_body = ReaderStream::new(InspectReader::new(
        tokio::io::BufReader::with_capacity(1048576, upload_body),
        move |b| {
            total_read += b.len();
            print!(
                "\ruploading... {:.2} % ({} of {})",
                (100.0 * total_read as f64) / file_length as f64,
                total_read,
                file_length
            );
        },
    ));

    let at = request_token().await;
    let c = reqwest::Client::new();
    let resp = c
        .put(url)
        .body(reqwest::Body::wrap_stream(upload_body))
        .header(reqwest::header::CONTENT_TYPE, content_type.as_ref())
        .header(reqwest::header::AUTHORIZATION, format!("Token {at}"))
        .send()
        .await
        .expect("Failed to send object");
    print!("\n");
    println!("added #{}", resp.text().await.expect("no text response"));
}

async fn delete(server_base: Url, args: DeleteArgs) {
    let mut url = server_base;
    url.path_segments_mut()
        .expect("can be base")
        .extend(["content", &args.id.to_string()]);
    if args.force {
        url.query_pairs_mut().append_key_only("force");
    }

    println!("Attempt to delete content #{}; {url}", args.id);

    if !args.no_dry_run {
        println!("* This run is dry-run. To execute actual deletion, pass `-n`");
        return;
    }

    let c = reqwest::Client::new();
    let resp = c.delete(url).send().await.expect("Failed to send request");
    println!("response code: {:?}", resp.status());
}

async fn list(server_base: Url) {
    let at = request_token().await;
    let resp = reqwest::Client::new()
        .get(server_base)
        .header(reqwest::header::AUTHORIZATION, format!("Token {at}"))
        .send()
        .await
        .expect("Failed to send request")
        .text()
        .await
        .expect("Failed to receive list text");

    println!("{resp}");
}

async fn request_token() -> String {
    let token_store_path = homedir::get_my_home()
        .expect("Failed to get home directory")
        .expect("home directory missing")
        .join(".ct2.soundscape/cred");

    let client_id = dotenv::var("API_CLIENT_ID").expect("no API_CLIENT_ID set");
    let client_secret = dotenv::var("API_CLIENT_SECRET").expect("no API_CLIENT_SECRET set");
    let tenancy = auth0::Tenancy::from_domain("ct2.jp.auth0.com").unwrap();
    let app = auth0::APIClientApplication {
        tenancy: &tenancy,
        client_id: &client_id,
        client_secret: &client_secret,
        audience: "https://ach.sound.ct2.io/",
    };

    'try_existing_token: {
        if token_store_path.exists() {
            // try reusing token
            let token = match tokio::fs::read_to_string(&token_store_path).await {
                Err(e) => {
                    eprintln!("Failed to read token store: {e:?}");
                    break 'try_existing_token;
                }
                Ok(v) => v,
            };
            let cv = app.by_ref().and(TimeAvailabilityValidator::for_now());
            if let Err(e) = jwt_validator::validate(&token, &tenancy, &cv).await {
                eprintln!("Failed to reuse token: {e:?}");
                break 'try_existing_token;
            }

            return token;
        }
    }

    let resp = app.request_token().await.expect("token request failed");
    let cv = app.by_ref().and(TimeAvailabilityValidator::for_now());
    jwt_validator::validate(&resp.access_token, &tenancy, &cv)
        .await
        .expect("invalid jwt");

    tokio::fs::create_dir_all(token_store_path.parent().unwrap())
        .await
        .expect("Failed to create token store directory");
    tokio::fs::write(&token_store_path, &resp.access_token)
        .await
        .expect("Failed to write token store");

    resp.access_token
}

#[tokio::main]
async fn main() {
    dotenv::dotenv().expect("Failed to load .env");

    let args = Args::parse();

    let server_base = args
        .server_url
        .unwrap_or_else(|| Url::parse("https://ach.sound.ct2.io/").unwrap());

    match args.commands {
        Commands::DescribeMedia(a) => describe_media(a).await,
        Commands::List => list(server_base).await,
        Commands::Upload(a) => upload(server_base, a).await,
        Commands::Delete(a) => delete(server_base, a).await,
    }
}
