use crate::error::Result;
use crate::sync::{merge, PlaybackEntry, SyncEntry, SyncPayload};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use ts_rs::TS;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS library (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    name        TEXT NOT NULL,
    poster      TEXT,
    favorite    INTEGER NOT NULL DEFAULT 0,
    watched     INTEGER NOT NULL DEFAULT 0,
    progress    REAL NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL,
    device_id   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_updated ON library(updated_at);

CREATE TABLE IF NOT EXISTS playback (
    id          TEXT PRIMARY KEY,
    position    REAL NOT NULL,
    duration    REAL NOT NULL,
    updated_at  INTEGER NOT NULL,
    device_id   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    op          TEXT NOT NULL,
    payload     TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);
";

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub poster: Option<String>,
    pub favorite: bool,
    pub watched: bool,
    pub progress: f64,
    pub updated_at: i64,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(app: &AppHandle) -> Result<Self> {
        let dir = app.path().app_data_dir()?;
        fs::create_dir_all(&dir)?;

        let conn = Connection::open(dir.join("ultravideo.db"))?;
        conn.execute_batch(SCHEMA)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().expect("mutex do banco envenenado")
    }

    pub fn list(&self) -> Result<Vec<LibraryItem>> {
        let conn = self.conn();
        let mut statement = conn.prepare(
            "SELECT id, kind, name, poster, favorite, watched, progress, updated_at
             FROM library ORDER BY updated_at DESC",
        )?;

        let rows = statement.query_map([], |row| {
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
        })?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn export_payload(&self) -> Result<SyncPayload> {
        let conn = self.conn();
        let mut payload = SyncPayload::default();

        {
            let mut statement = conn.prepare(
                "SELECT id, kind, name, poster, favorite, watched, progress, updated_at, device_id
                 FROM library ORDER BY id",
            )?;
            let rows = statement.query_map([], |row| {
                Ok(SyncEntry {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    name: row.get(2)?,
                    poster: row.get(3)?,
                    favorite: row.get::<_, i64>(4)? != 0,
                    watched: row.get::<_, i64>(5)? != 0,
                    progress: row.get(6)?,
                    updated_at: row.get(7)?,
                    device_id: row.get(8)?,
                })
            })?;
            payload.library = rows.collect::<std::result::Result<Vec<_>, _>>()?;
        }

        {
            let mut statement = conn.prepare(
                "SELECT id, position, duration, updated_at, device_id
                 FROM playback ORDER BY id",
            )?;
            let rows = statement.query_map([], |row| {
                Ok(PlaybackEntry {
                    id: row.get(0)?,
                    position: row.get(1)?,
                    duration: row.get(2)?,
                    updated_at: row.get(3)?,
                    device_id: row.get(4)?,
                })
            })?;
            payload.playback = rows.collect::<std::result::Result<Vec<_>, _>>()?;
        }

        Ok(payload)
    }

    pub fn apply_payload(&self, incoming: &SyncPayload) -> Result<usize> {
        let mut local = self.export_payload()?;
        let applied = merge(&mut local, incoming.clone());

        let mut conn = self.conn();
        let transaction = conn.transaction()?;

        transaction.execute("DELETE FROM library", [])?;
        {
            let mut statement = transaction.prepare(
                "INSERT INTO library
                 (id, kind, name, poster, favorite, watched, progress, updated_at, device_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )?;
            for entry in &local.library {
                statement.execute(params![
                    entry.id,
                    entry.kind,
                    entry.name,
                    entry.poster,
                    entry.favorite as i64,
                    entry.watched as i64,
                    entry.progress,
                    entry.updated_at,
                    entry.device_id,
                ])?;
            }
        }

        transaction.execute("DELETE FROM playback", [])?;
        {
            let mut statement = transaction.prepare(
                "INSERT INTO playback (id, position, duration, updated_at, device_id)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for entry in &local.playback {
                statement.execute(params![
                    entry.id,
                    entry.position,
                    entry.duration,
                    entry.updated_at,
                    entry.device_id,
                ])?;
            }
        }

        transaction.commit()?;
        Ok(applied)
    }
}

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Identificador estavel por instalacao usado no desempate do LWW.
pub fn device_id(app: &AppHandle) -> Result<String> {
    let path = app.path().app_data_dir()?.join("device_id");
    if path.exists() {
        return Ok(fs::read_to_string(path)?.trim().to_string());
    }

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;
    let id = format!("{nanos:016x}");
    fs::write(&path, &id)?;
    Ok(id)
}
