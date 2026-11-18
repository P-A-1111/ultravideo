use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("manifesto invalido: {0}")]
    InvalidManifest(String),
    #[error("add-on nao encontrado: {0}")]
    AddonNotFound(String),
    #[error("recurso nao suportado: {0}")]
    UnsupportedResource(String),
    #[error("rede: {0}")]
    Network(#[from] reqwest::Error),
    #[error("url: {0}")]
    Url(String),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("tauri: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("banco: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
