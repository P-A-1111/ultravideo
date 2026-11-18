use tauri::Emitter;

pub const ADDONS_CHANGED: &str = "uv://addons-changed";
pub const LIBRARY_CHANGED: &str = "uv://library-changed";
pub const PLAYBACK_CHANGED: &str = "uv://playback-changed";
pub const SYNC_CHANGED: &str = "uv://sync-changed";

pub fn emit(app: &tauri::AppHandle, event: &str) {
    let _ = app.emit(event, ());
}
