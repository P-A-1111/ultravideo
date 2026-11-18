use crate::error::Result;
use crate::streaming::{TorrentEngine, DEFAULT_CACHE_LIMIT};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::OnceCell;

/// Inicialização lazy: o engine só sobe quando o usuário abre um torrent.
pub struct TorrentManager {
    cell: OnceCell<Arc<TorrentEngine>>,
}

impl TorrentManager {
    pub fn new() -> Self {
        Self {
            cell: OnceCell::new(),
        }
    }

    pub async fn get(&self, app: &AppHandle) -> Result<&Arc<TorrentEngine>> {
        self.cell
            .get_or_try_init(|| async {
                let directory = app.path().app_data_dir()?.join("cache");
                let engine = Arc::new(TorrentEngine::start(directory, DEFAULT_CACHE_LIMIT).await?);

                let server_engine = engine.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = crate::streaming::serve(server_engine).await;
                });

                Ok(engine)
            })
            .await
    }
}
