use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use ts_rs::TS;

/// Um stream do protocolo Stremio. `url` e `infoHash` sao alternativas:
/// magnet/torrent usam infoHash + fileIdx; HTTP/HLS usam url.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Stream {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub info_hash: Option<String>,
    #[serde(default)]
    pub file_idx: Option<usize>,
    #[serde(default)]
    pub external_url: Option<String>,
    #[serde(default)]
    pub yt_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub behavior_hints: Option<BehaviorHints>,
    #[serde(default, flatten)]
    pub extensions: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorHints {
    #[serde(default)]
    pub not_web_ready: bool,
    #[serde(default)]
    pub binge_group: Option<String>,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub video_size: Option<u64>,
    #[serde(default)]
    pub video_hash: Option<String>,
    #[serde(default)]
    pub configuration_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Subtitle {
    pub id: String,
    pub url: String,
    pub lang: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
pub struct StreamsResponse {
    #[serde(default)]
    pub streams: Vec<Stream>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
pub struct SubtitlesResponse {
    #[serde(default)]
    pub subtitles: Vec<Subtitle>,
}
