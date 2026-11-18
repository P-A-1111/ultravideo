use crate::error::{AppError, Result};
use reqwest::Url;
use serde::de::DeserializeOwned;
use std::collections::HashMap;
use std::time::Duration;

const TIMEOUT_SECS: u64 = 15;

pub fn build_url(base: &str, segments: &[&str], query: &HashMap<String, String>) -> Result<Url> {
    let mut url = Url::parse(&format!("{}/", base.trim_end_matches('/')))
        .map_err(|e| AppError::Url(format!("URL base invalida: {e}")))?;

    {
        let mut path = url
            .path_segments_mut()
            .map_err(|_| AppError::Url("URL nao pode ser base".into()))?;
        path.pop_if_empty();
        for segment in segments {
            path.push(segment);
        }
    }

    {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in query {
            pairs.append_pair(key, value);
        }
    }

    Ok(url)
}

pub async fn fetch_json<T: DeserializeOwned>(url: Url) -> Result<T> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .build()?;

    let response = client.get(url).send().await?.error_for_status()?;
    Ok(response.json::<T>().await?)
}

pub async fn fetch_manifest(base: &str) -> Result<crate::domain::Manifest> {
    let url = build_url(base, &["manifest.json"], &HashMap::new())?;
    fetch_json(url).await
}
