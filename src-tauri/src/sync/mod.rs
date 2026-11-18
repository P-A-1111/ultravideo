use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use ts_rs::TS;

pub const FORMAT: &str = "ultravideo-sync";
pub const VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SyncEntry {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub poster: Option<String>,
    pub favorite: bool,
    pub watched: bool,
    pub progress: f64,
    pub updated_at: i64,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackEntry {
    pub id: String,
    pub position: f64,
    pub duration: f64,
    pub updated_at: i64,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncPayload {
    #[serde(default)]
    pub library: Vec<SyncEntry>,
    #[serde(default)]
    pub playback: Vec<PlaybackEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SyncFile {
    pub format: String,
    pub version: u32,
    pub generated_at: i64,
    pub device_id: String,
    pub checksum: String,
    pub data: SyncPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SyncFileMeta {
    pub path: String,
    pub entries: usize,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub applied: usize,
    pub total: usize,
    pub from_device: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Operation {
    Favorite {
        id: String,
        value: bool,
    },
    Watched {
        id: String,
        value: bool,
    },
    Progress {
        id: String,
        position: f64,
        duration: f64,
    },
}

fn canonical_bytes(payload: &SyncPayload) -> Result<Vec<u8>> {
    let mut payload = payload.clone();
    payload
        .library
        .sort_by(|left, right| left.id.cmp(&right.id));
    payload
        .playback
        .sort_by(|left, right| left.id.cmp(&right.id));
    serde_json::to_vec(&payload).map_err(|error| AppError::Other(error.to_string()))
}

pub fn checksum(payload: &SyncPayload) -> Result<String> {
    let mut hasher = Sha256::new();
    hasher.update(canonical_bytes(payload)?);
    Ok(format!("sha256:{:x}", hasher.finalize()))
}

pub fn build_file(payload: SyncPayload, device_id: String) -> Result<SyncFile> {
    let checksum = checksum(&payload)?;
    Ok(SyncFile {
        format: FORMAT.into(),
        version: VERSION,
        generated_at: crate::store::now(),
        device_id,
        checksum,
        data: payload,
    })
}

pub fn parse_file(raw: &str) -> Result<SyncFile> {
    let file: SyncFile = serde_json::from_str(raw)
        .map_err(|error| AppError::Other(format!("JSON invalido: {error}")))?;

    if file.format != FORMAT {
        return Err(AppError::Other("nao e um arquivo ultravideo-sync".into()));
    }
    if file.version != VERSION {
        return Err(AppError::Other(format!(
            "versao {} nao suportada (esperada {})",
            file.version, VERSION
        )));
    }
    if checksum(&file.data)? != file.checksum {
        return Err(AppError::Other(
            "checksum divergente: arquivo corrompido ou editado manualmente".into(),
        ));
    }

    Ok(file)
}

fn remote_wins(
    local_updated: i64,
    local_device: &str,
    remote_updated: i64,
    remote_device: &str,
) -> bool {
    remote_updated > local_updated
        || (remote_updated == local_updated && remote_device > local_device)
}

/// Merge bidirecional. Nao descarta entradas locais ausentes no arquivo.
pub fn merge(local: &mut SyncPayload, incoming: SyncPayload) -> usize {
    let mut applied = 0;

    let mut library: BTreeMap<String, SyncEntry> = local
        .library
        .iter()
        .map(|entry| (entry.id.clone(), entry.clone()))
        .collect();
    for remote in incoming.library {
        let winner = match library.get(&remote.id) {
            Some(current)
                if remote_wins(
                    current.updated_at,
                    &current.device_id,
                    remote.updated_at,
                    &remote.device_id,
                ) =>
            {
                applied += 1;
                remote
            }
            Some(_) => continue,
            None => {
                applied += 1;
                remote
            }
        };
        library.insert(winner.id.clone(), winner);
    }
    local.library = library.into_values().collect();

    let mut playback: BTreeMap<String, PlaybackEntry> = local
        .playback
        .iter()
        .map(|entry| (entry.id.clone(), entry.clone()))
        .collect();
    for remote in incoming.playback {
        let winner = match playback.get(&remote.id) {
            Some(current)
                if remote_wins(
                    current.updated_at,
                    &current.device_id,
                    remote.updated_at,
                    &remote.device_id,
                ) =>
            {
                applied += 1;
                remote
            }
            Some(_) => continue,
            None => {
                applied += 1;
                remote
            }
        };
        playback.insert(winner.id.clone(), winner);
    }
    local.playback = playback.into_values().collect();

    applied
}

/// Mesma engine de merge; o servico pago so troca o transporte.
pub trait CloudSync: Send + Sync {
    fn push(&self, operations: &[Operation]) -> Result<()>;
    fn pull(&self, since: i64) -> Result<Vec<SyncEntry>>;
}

pub struct NoopSync;

impl CloudSync for NoopSync {
    fn push(&self, _operations: &[Operation]) -> Result<()> {
        Ok(())
    }

    fn pull(&self, _since: i64) -> Result<Vec<SyncEntry>> {
        Ok(Vec::new())
    }
}
