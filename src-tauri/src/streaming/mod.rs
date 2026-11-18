use crate::domain::Stream;
use crate::error::{AppError, Result};
use axum::body::Body;
use axum::extract::{Path as AxumPath, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use librqbit::{AddTorrent, AddTorrentResponse, Session, SessionOptions};
use serde::Serialize;
use std::fs;
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use ts_rs::TS;

pub const CLIENT_NAME: &str = "UVIDEOclient 0.1";
pub const DEFAULT_CACHE_LIMIT: u64 = 2 * 1024 * 1024 * 1024;
pub const STREAM_PORT: u16 = 3030;
pub const SEED_MAX_DURATION: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum StreamKind {
    Http,
    Hls,
    Torrent,
    YouTube,
    External,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedStream {
    pub url: String,
    pub kind: StreamKind,
    pub requires_native_player: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CacheStatus {
    pub used_bytes: u64,
    pub limit_bytes: u64,
    pub torrents: usize,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SeedStatus {
    pub allowed: bool,
    pub active: bool,
    pub remaining_secs: u64,
    pub torrents: usize,
}

#[derive(Clone)]
pub struct TorrentEngine {
    session: Arc<Session>,
    cache_dir: PathBuf,
    limit_bytes: u64,
    seeding_allowed: Arc<AtomicBool>,
    seed_since: Arc<std::sync::Mutex<Option<Instant>>>,
}

impl TorrentEngine {
    pub async fn start(cache_dir: PathBuf, limit_bytes: u64) -> Result<Self> {
        fs::create_dir_all(&cache_dir)?;

        let options = SessionOptions {
            peer_id: Some(librqbit::generate_azereus_style(
                *b"UV",
                (0, 1, 0, 0),
            )),
            client_name_and_version: Some(CLIENT_NAME.into()),
            ..Default::default()
        };

        let session = Session::new_with_opts(cache_dir.clone(), options)
            .await
            .map_err(|error| AppError::Other(format!("torrent session: {error:#}")))?;

        let engine = Self {
            session,
            cache_dir,
            limit_bytes,
            seeding_allowed: Arc::new(AtomicBool::new(false)),
            seed_since: Arc::new(std::sync::Mutex::new(None)),
        };

        let watchdog = engine.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_secs(60));
            loop {
                ticker.tick().await;
                if !watchdog.seeding_allowed.load(Ordering::Relaxed) {
                    continue;
                }
                let expired = watchdog
                    .seed_since
                    .lock()
                    .ok()
                    .and_then(|guard| *guard)
                    .is_some_and(|start| start.elapsed() >= SEED_MAX_DURATION);
                if expired {
                    watchdog.set_seeding_allowed(false).await;
                }
            }
        });

        Ok(engine)
    }

    pub async fn set_seeding_allowed(&self, allowed: bool) {
        self.seeding_allowed.store(allowed, Ordering::Relaxed);
        if let Ok(mut guard) = self.seed_since.lock() {
            *guard = if allowed { Some(Instant::now()) } else { None };
        }

        if !allowed {
            let handles: Vec<_> = self
                .session
                .with_torrents(|torrents| torrents.map(|(_, handle)| handle.clone()).collect());
            for handle in handles {
                let _ = self.session.pause(&handle).await;
            }
        }
    }

    pub fn seed_status(&self) -> SeedStatus {
        let allowed = self.seeding_allowed.load(Ordering::Relaxed);
        let start = self.seed_since.lock().ok().and_then(|guard| *guard);
        let remaining_secs = start
            .map(|value| SEED_MAX_DURATION.saturating_sub(value.elapsed()).as_secs())
            .unwrap_or(SEED_MAX_DURATION.as_secs());
        let torrents = self.session.with_torrents(|torrents| torrents.count());

        SeedStatus {
            allowed,
            active: allowed && remaining_secs > 0,
            remaining_secs,
            torrents,
        }
    }

    pub async fn add(&self, magnet: &str, file_idx: usize) -> Result<ResolvedStream> {
        let response = self
            .session
            .clone()
            .add_torrent(AddTorrent::from_url(magnet), None)
            .await
            .map_err(|error| AppError::Other(format!("add torrent: {error:#}")))?;

        let id = match response {
            AddTorrentResponse::Added(id, _) | AddTorrentResponse::AlreadyManaged(id, _) => id,
            AddTorrentResponse::ListOnly(_) => {
                return Err(AppError::Other("torrent resolvido apenas como lista".into()))
            }
        };

        Ok(ResolvedStream {
            url: format!("http://127.0.0.1:{STREAM_PORT}/torrents/{id}/stream/{file_idx}"),
            kind: StreamKind::Torrent,
            requires_native_player: false,
        })
    }

    pub fn cache_status(&self) -> Result<CacheStatus> {
        Ok(CacheStatus {
            used_bytes: directory_size(&self.cache_dir)?,
            limit_bytes: self.limit_bytes,
            torrents: self.session.with_torrents(|torrents| torrents.count()),
        })
    }

    /// LRU simples: remove os arquivos mais antigos quando passa do limite.
    pub fn enforce_cache(&self) -> Result<()> {
        let mut used = directory_size(&self.cache_dir)?;
        if used <= self.limit_bytes {
            return Ok(());
        }

        let mut files = collect_files(&self.cache_dir)?;
        files.sort_by_key(|(_, modified)| *modified);

        let target = self.limit_bytes * 9 / 10;
        for (path, _) in files {
            if used <= target {
                break;
            }
            if let Ok(metadata) = fs::metadata(&path) {
                used = used.saturating_sub(metadata.len());
            }
            let _ = fs::remove_file(path);
        }

        Ok(())
    }
}

pub async fn serve(engine: Arc<TorrentEngine>) -> Result<()> {
    let app = Router::new()
        .route("/torrents/{id}/stream/{file}", get(stream_handler))
        .with_state(engine);

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", STREAM_PORT)).await?;
    axum::serve(listener, app)
        .await
        .map_err(|error| AppError::Other(format!("stream server: {error}")))?;
    Ok(())
}

async fn stream_handler(
    State(engine): State<Arc<TorrentEngine>>,
    AxumPath((id, file_idx)): AxumPath<(usize, usize)>,
    headers: HeaderMap,
) -> std::result::Result<Response, StatusCode> {
    let handle = engine
        .session
        .get(librqbit::api::TorrentIdOrHash::Id(id))
        .ok_or(StatusCode::NOT_FOUND)?;
    let mut stream = handle
        .stream(file_idx)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let length = stream.len();
    let range = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(parse_range);

    let last = length.saturating_sub(1);
    let (start, end) = match range {
        Some((requested_start, requested_end)) => (
            requested_start.min(last),
            requested_end.min(last),
        ),
        None => (0, last),
    };

    if start > end {
        return Err(StatusCode::RANGE_NOT_SATISFIABLE);
    }

    stream
        .seek(SeekFrom::Start(start))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let chunk = end - start + 1;
    let body = Body::from_stream(ReaderStream::new(stream.take(chunk)));

    let mut builder = Response::builder()
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, chunk)
        .header(header::CONTENT_TYPE, "video/mp4");

    if range.is_some() {
        builder = builder
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{length}"));
    }

    builder.body(body).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn parse_range(value: &str) -> Option<(u64, u64)> {
    let value = value.strip_prefix("bytes=")?;
    let (start, end) = value.split_once('-')?;
    let start = start.parse().ok()?;
    let end = if end.is_empty() {
        u64::MAX
    } else {
        end.parse().ok()?
    };
    Some((start, end))
}

fn directory_size(path: &Path) -> Result<u64> {
    let mut total = 0;
    if !path.exists() {
        return Ok(0);
    }
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            total += directory_size(&entry.path())?;
        } else {
            total += metadata.len();
        }
    }
    Ok(total)
}

fn collect_files(path: &Path) -> Result<Vec<(PathBuf, std::time::SystemTime)>> {
    let mut files = Vec::new();
    if !path.exists() {
        return Ok(files);
    }
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            files.extend(collect_files(&entry.path())?);
        } else {
            files.push((entry.path(), metadata.modified().unwrap_or(std::time::UNIX_EPOCH)));
        }
    }
    Ok(files)
}

pub fn resolve(stream: &Stream) -> Result<ResolvedStream> {
    if let Some(youtube_id) = &stream.yt_id {
        return Ok(ResolvedStream {
            url: format!("https://www.youtube.com/watch?v={youtube_id}"),
            kind: StreamKind::YouTube,
            requires_native_player: true,
        });
    }

    if let Some(url) = &stream.url {
        if url.starts_with("magnet:") {
            return Err(AppError::UnsupportedResource(
                "torrent: use add_torrent para iniciar o stream".into(),
            ));
        }
        let kind = if url.contains(".m3u8") {
            StreamKind::Hls
        } else {
            StreamKind::Http
        };
        return Ok(ResolvedStream {
            url: url.clone(),
            kind,
            requires_native_player: stream
                .behavior_hints
                .as_ref()
                .is_some_and(|hints| hints.not_web_ready),
        });
    }

    if stream.info_hash.is_some() {
        return Err(AppError::UnsupportedResource(
            "torrent: use add_torrent para iniciar o stream".into(),
        ));
    }

    if let Some(url) = &stream.external_url {
        return Ok(ResolvedStream {
            url: url.clone(),
            kind: StreamKind::External,
            requires_native_player: true,
        });
    }

    Err(AppError::UnsupportedResource(
        "stream sem url, infoHash ou ytId".into(),
    ))
}
