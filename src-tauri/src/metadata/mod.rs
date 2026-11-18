use crate::domain::MetaPreview;
use crate::error::Result;
use reqwest::Url;
use serde_json::Value;
use std::time::Duration;

pub struct MetadataClient {
    http: reqwest::Client,
    tmdb_key: Option<String>,
}

impl MetadataClient {
    pub fn new() -> Result<Self> {
        Ok(Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()?,
            tmdb_key: std::env::var("TMDB_API_KEY").ok(),
        })
    }

    pub async fn search(&self, query: &str) -> Result<Vec<MetaPreview>> {
        let Some(key) = &self.tmdb_key else {
            return Ok(Vec::new());
        };
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }

        let url = Url::parse_with_params(
            "https://api.themoviedb.org/3/search/multi",
            &[("api_key", key.as_str()), ("query", query), ("page", "1")],
        )
        .map_err(|error| crate::error::AppError::Url(error.to_string()))?;

        let body: Value = self
            .http
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let results = body
            .get("results")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        Ok(results.iter().map(map_tmdb_item).collect())
    }
}

fn map_tmdb_item(item: &Value) -> MetaPreview {
    let media_type = item
        .get("media_type")
        .and_then(Value::as_str)
        .unwrap_or("movie");
    let kind = if media_type == "tv" {
        "series"
    } else {
        "movie"
    };
    let title = item
        .get("title")
        .or_else(|| item.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("Sem titulo");
    let released = item
        .get("release_date")
        .or_else(|| item.get("first_air_date"))
        .and_then(Value::as_str);
    let poster_path = item.get("poster_path").and_then(Value::as_str);

    MetaPreview {
        id: item.get("id").map(Value::to_string).unwrap_or_default(),
        kind: kind.into(),
        name: title.into(),
        poster: poster_path.map(|path| format!("https://image.tmdb.org/t/p/w500{path}")),
        poster_shape: None,
        background: item
            .get("backdrop_path")
            .and_then(Value::as_str)
            .map(|path| format!("https://image.tmdb.org/t/p/w1280{path}")),
        logo: None,
        description: item
            .get("overview")
            .and_then(Value::as_str)
            .map(str::to_string),
        release_info: released.map(|value| value.chars().take(4).collect()),
        imdb_rating: item
            .get("vote_average")
            .and_then(Value::as_f64)
            .map(|value| format!("{value:.1}")),
        extensions: Default::default(),
    }
}
