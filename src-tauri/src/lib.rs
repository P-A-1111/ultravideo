mod addons;
mod commands;
mod domain;
mod error;
mod events;
#[allow(dead_code)]
mod metadata;
mod store;
mod streaming;
#[allow(dead_code)]
mod sync;
mod torrent;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db = store::Database::open(app.handle())?;
            app.manage(db);

            let path = addons::registry_path(app.handle())?;
            app.manage(Mutex::new(addons::Registry::load(&path)?));
            app.manage(Arc::new(torrent::TorrentManager::new()));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_addons,
            commands::install_addon,
            commands::uninstall_addon,
            commands::get_catalog,
            commands::get_meta,
            commands::get_streams,
            commands::get_subtitles,
            commands::resolve_stream,
            commands::get_library,
            commands::toggle_favorite,
            commands::mark_watched,
            commands::save_progress,
            commands::export_sync_file,
            commands::import_sync_file,
            commands::add_torrent,
            commands::get_cache_status,
            commands::set_seeding_allowed,
            commands::get_seed_status,
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar ultravideo");
}
