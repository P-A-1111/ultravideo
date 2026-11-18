use crate::addons;
use crate::domain::{Descriptor, Meta, MetaPreview, Stream, Subtitle};
use crate::error::Result;
use crate::events;
use crate::store::{self, Database, LibraryItem};
use crate::streaming::{self, CacheStatus, ResolvedStream, SeedStatus};
use crate::sync::{self, ImportReport, SyncFileMeta};
use crate::torrent;
use rusqlite::params;
use std::collections::HashMap;
use std::fs;
use std::sync::Arc;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tokio::sync::{Mutex, MutexGuard};

const UPSERT_LIBRARY: &str = "
INSERT INTO library (id, kind, name, poster, favorite, watched, progress, updated_at, device_id)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    poster=excluded.poster,
    favorite=excluded.favorite,
    watched=excluded.watched,
    progress=excluded.progress,
    updated_at=excluded.updated_at,
    device_id=excluded.device_id
";

const UPSERT_PROGRESS: &str = "
INSERT INTO library (id, kind, name, poster, favorite, watched, progress, updated_at, device_id)
VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6, ?7)
ON CONFLICT(id) DO UPDATE SET
    progress=excluded.progress,
    updated_at=excluded.updated_at,
    device_id=excluded.device_id
";

async fn registry_lock(
    registry: &Mutex<addons::Registry>,
) -> Result<MutexGuard<'_, addons::Registry>> {
    Ok(registry.lock().await)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_addons(registry: State<'_, Mutex<addons::Registry>>) -> Result<Vec<Descriptor>> {
    Ok(registry_lock(&registry).await?.list())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn install_addon(
    url: String,
    registry: State<'_, Mutex<addons::Registry>>,
    app: AppHandle,
) -> Result<Descriptor> {
    let mut registry = registry_lock(&registry).await?;
    let descriptor = registry.install(&url).await?;
    registry.save(&addons::registry_path(&app)?)?;
    events::emit(&app, events::ADDONS_CHANGED);
    Ok(descriptor)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn uninstall_addon(
    id: String,
    registry: State<'_, Mutex<addons::Registry>>,
    app: AppHandle,
) -> Result<()> {
    let mut registry = registry_lock(&registry).await?;
    registry.uninstall(&id)?;
    registry.save(&addons::registry_path(&app)?)?;
    events::emit(&app, events::ADDONS_CHANGED);
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_catalog(
    kind: String,
    catalog: String,
    extra: HashMap<String, String>,
    registry: State<'_, Mutex<addons::Registry>>,
) -> Result<Vec<MetaPreview>> {
    let snapshot = registry_lock(&registry).await?;
    addons::get_catalog(&snapshot, &kind, &catalog, &extra).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_meta(
    kind: String,
    id: String,
    registry: State<'_, Mutex<addons::Registry>>,
) -> Result<Option<Meta>> {
    let snapshot = registry_lock(&registry).await?;
    addons::get_meta(&snapshot, &kind, &id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_streams(
    kind: String,
    id: String,
    registry: State<'_, Mutex<addons::Registry>>,
) -> Result<Vec<Stream>> {
    let snapshot = registry_lock(&registry).await?;
    addons::get_streams(&snapshot, &kind, &id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_subtitles(
    kind: String,
    id: String,
    lang: Option<String>,
    registry: State<'_, Mutex<addons::Registry>>,
) -> Result<Vec<Subtitle>> {
    let snapshot = registry_lock(&registry).await?;
    addons::get_subtitles(&snapshot, &kind, &id, lang.as_deref()).await
}

#[tauri::command(rename_all = "camelCase")]
pub fn resolve_stream(stream: Stream) -> Result<ResolvedStream> {
    streaming::resolve(&stream)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn add_torrent(
    url: String,
    file_idx: Option<usize>,
    manager: State<'_, Arc<torrent::TorrentManager>>,
    app: AppHandle,
) -> Result<ResolvedStream> {
    let engine = manager.get(&app).await?;
    let resolved = engine.add(&url, file_idx.unwrap_or(0)).await?;
    engine.enforce_cache()?;
    Ok(resolved)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_seeding_allowed(
    allowed: bool,
    manager: State<'_, Arc<torrent::TorrentManager>>,
    app: AppHandle,
) -> Result<SeedStatus> {
    let engine = manager.get(&app).await?;
    engine.set_seeding_allowed(allowed).await;
    Ok(engine.seed_status())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_seed_status(
    manager: State<'_, Arc<torrent::TorrentManager>>,
    app: AppHandle,
) -> Result<SeedStatus> {
    Ok(manager.get(&app).await?.seed_status())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_cache_status(
    manager: State<'_, Arc<torrent::TorrentManager>>,
    app: AppHandle,
) -> Result<CacheStatus> {
    manager.get(&app).await?.cache_status()
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_library(db: State<'_, Database>) -> Result<Vec<LibraryItem>> {
    db.list()
}

#[tauri::command(rename_all = "camelCase")]
pub fn toggle_favorite(
    id: String,
    kind: String,
    name: String,
    poster: Option<String>,
    db: State<'_, Database>,
    app: AppHandle,
) -> Result<LibraryItem> {
    let item = mutate_library(&db, &app, &id, &kind, &name, poster, |item| {
        item.favorite = !item.favorite;
    })?;
    events::emit(&app, events::LIBRARY_CHANGED);
    Ok(item)
}

#[tauri::command(rename_all = "camelCase")]
pub fn mark_watched(
    id: String,
    kind: String,
    name: String,
    poster: Option<String>,
    watched: bool,
    db: State<'_, Database>,
    app: AppHandle,
) -> Result<LibraryItem> {
    let item = mutate_library(&db, &app, &id, &kind, &name, poster, |item| {
        item.watched = watched;
    })?;
    events::emit(&app, events::LIBRARY_CHANGED);
    Ok(item)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(rename_all = "camelCase")]
pub fn save_progress(
    id: String,
    kind: String,
    name: String,
    poster: Option<String>,
    position: f64,
    duration: f64,
    db: State<'_, Database>,
    app: AppHandle,
) -> Result<()> {
    let conn = db.conn();
    let timestamp = store::now();
    let device = store::device_id(&app)?;
    let progress = if duration > 0.0 {
        (position / duration).clamp(0.0, 1.0)
    } else {
        0.0
    };

    conn.execute(
        "INSERT INTO playback (id, position, duration, updated_at, device_id)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
            position=excluded.position,
            duration=excluded.duration,
            updated_at=excluded.updated_at,
            device_id=excluded.device_id",
        params![id, position, duration, timestamp, device],
    )?;

    conn.execute(
        UPSERT_PROGRESS,
        params![id, kind, name, poster, progress, timestamp, device],
    )?;

    events::emit(&app, events::PLAYBACK_CHANGED);
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_sync_file(
    path: Option<String>,
    db: State<'_, Database>,
    app: AppHandle,
) -> Result<SyncFileMeta> {
    let payload = db.export_payload()?;
    let file = sync::build_file(payload, store::device_id(&app)?)?;

    let target = match path {
        Some(path) => PathBuf::from(path),
        None => app
            .path()
            .download_dir()?
            .join(format!("ultravideo-sync-{}.json", store::now())),
    };

    fs::write(&target, serde_json::to_string_pretty(&file)?)?;
    events::emit(&app, events::SYNC_CHANGED);

    Ok(SyncFileMeta {
        path: target.to_string_lossy().into_owned(),
        entries: file.data.library.len() + file.data.playback.len(),
        checksum: file.checksum,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn import_sync_file(
    path: String,
    db: State<'_, Database>,
    app: AppHandle,
) -> Result<ImportReport> {
    let raw = fs::read_to_string(&path)?;
    let file = sync::parse_file(&raw)?;
    let total = file.data.library.len() + file.data.playback.len();
    let applied = db.apply_payload(&file.data)?;

    events::emit(&app, events::LIBRARY_CHANGED);
    Ok(ImportReport {
        applied,
        total,
        from_device: file.device_id,
    })
}

#[allow(clippy::too_many_arguments)]
fn mutate_library(
    db: &Database,
    app: &AppHandle,
    id: &str,
    kind: &str,
    name: &str,
    poster: Option<String>,
    change: impl FnOnce(&mut LibraryItem),
) -> Result<LibraryItem> {
    let conn = db.conn();

    let mut item = {
        let mut statement = conn.prepare(
            "SELECT id, kind, name, poster, favorite, watched, progress, updated_at
             FROM library WHERE id = ?1",
        )?;

        match statement.query_row([id], |row| {
            Ok(LibraryItem {
                id: row.get(0)?,
                kind: row.get(1)?,
                name: row.get(2)?,
                poster: row.get(3)?,
                favorite: row.get::<_, i64>(4)? != 0,
                watched: row.get::<_, i64>(5)? != 0,
                progress: row.get(6)?,
                updated_at: row.get(7)?,
            })
        }) {
            Ok(existing) => existing,
            Err(rusqlite::Error::QueryReturnedNoRows) => LibraryItem {
                id: id.into(),
                kind: kind.into(),
                name: name.into(),
                poster,
                favorite: false,
                watched: false,
                progress: 0.0,
                updated_at: 0,
            },
            Err(error) => return Err(error.into()),
        }
    };

    change(&mut item);
    item.updated_at = store::now();

    conn.execute(
        UPSERT_LIBRARY,
        params![
            item.id,
            item.kind,
            item.name,
            item.poster,
            item.favorite as i64,
            item.watched as i64,
            item.progress,
            item.updated_at,
            store::device_id(app)?,
        ],
    )?;

    Ok(item)
}
