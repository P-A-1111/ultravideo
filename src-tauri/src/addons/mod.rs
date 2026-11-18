pub mod registry;
pub mod transport;

use crate::domain::{
    CatalogResponse, Meta, MetaPreview, MetaResponse, Stream, StreamsResponse, Subtitle,
    SubtitlesResponse,
};
use crate::error::Result;
pub use registry::Registry;
use std::collections::HashMap;
use tauri::Manager;

pub fn registry_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf> {
    Ok(app.path().app_data_dir()?.join("addons.json"))
}

pub async fn get_catalog(
    registry: &Registry,
    kind: &str,
    catalog_id: &str,
    extra: &HashMap<String, String>,
) -> Result<Vec<MetaPreview>> {
    let mut pending = Vec::new();

    for descriptor in registry.list() {
        if !descriptor.manifest.supports("catalog", kind, None) {
            continue;
        }

        let declares_catalog = descriptor.manifest.catalogs.is_empty()
            || descriptor
                .manifest
                .catalogs
                .iter()
                .any(|catalog| catalog.id == catalog_id && catalog.kind == kind);

        if !declares_catalog {
            continue;
        }

        let segments = ["catalog", kind, &format!("{catalog_id}.json")];
        if let Ok(url) = transport::build_url(&descriptor.transport_url, &segments, extra) {
            pending.push(transport::fetch_json::<CatalogResponse>(url));
        }
    }

    let mut items = Vec::new();
    for response in futures::future::join_all(pending)
        .await
        .into_iter()
        .flatten()
    {
        items.extend(response.metas);
    }

    Ok(items)
}

pub async fn get_meta(registry: &Registry, kind: &str, id: &str) -> Result<Option<Meta>> {
    let mut pending = Vec::new();

    for descriptor in registry.list() {
        if !descriptor.manifest.supports("meta", kind, Some(id)) {
            continue;
        }
        let segments = ["meta", kind, &format!("{id}.json")];
        if let Ok(url) = transport::build_url(&descriptor.transport_url, &segments, &HashMap::new())
        {
            pending.push(transport::fetch_json::<MetaResponse>(url));
        }
    }

    for response in futures::future::join_all(pending)
        .await
        .into_iter()
        .flatten()
    {
        if let Some(meta) = response.meta {
            return Ok(Some(meta));
        }
    }

    Ok(None)
}

pub async fn get_streams(registry: &Registry, kind: &str, id: &str) -> Result<Vec<Stream>> {
    let mut pending = Vec::new();

    for descriptor in registry.list() {
        if !descriptor.manifest.supports("stream", kind, Some(id)) {
            continue;
        }
        let segments = ["stream", kind, &format!("{id}.json")];
        if let Ok(url) = transport::build_url(&descriptor.transport_url, &segments, &HashMap::new())
        {
            pending.push(transport::fetch_json::<StreamsResponse>(url));
        }
    }

    let mut streams = Vec::new();
    for response in futures::future::join_all(pending)
        .await
        .into_iter()
        .flatten()
    {
        streams.extend(response.streams);
    }

    Ok(streams)
}

pub async fn get_subtitles(
    registry: &Registry,
    kind: &str,
    id: &str,
    lang: Option<&str>,
) -> Result<Vec<Subtitle>> {
    let mut extra = HashMap::new();
    if let Some(lang) = lang {
        extra.insert("lang".into(), lang.into());
    }

    let mut pending = Vec::new();
    for descriptor in registry.list() {
        if !descriptor.manifest.supports("subtitles", kind, Some(id)) {
            continue;
        }
        let segments = ["subtitles", kind, &format!("{id}.json")];
        if let Ok(url) = transport::build_url(&descriptor.transport_url, &segments, &extra) {
            pending.push(transport::fetch_json::<SubtitlesResponse>(url));
        }
    }

    let mut subtitles = Vec::new();
    for response in futures::future::join_all(pending)
        .await
        .into_iter()
        .flatten()
    {
        subtitles.extend(response.subtitles);
    }

    Ok(subtitles)
}
