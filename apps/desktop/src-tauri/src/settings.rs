//! Desktop shell settings, persisted as settings.json in the app-data dir.
//! `server_url` set → the shell connects the webview to that self-hosted
//! specpasa instead of spawning the bundled local server (Bitwarden-style
//! self-host pointing).

use tauri::Manager;

#[derive(Default, Clone, serde::Serialize, serde::Deserialize)]
pub struct Settings {
    pub server_url: Option<String>,
}

fn path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("settings.json"))
}

pub fn load(app: &tauri::AppHandle) -> Settings {
    let Some(p) = path(app) else {
        return Settings::default();
    };
    std::fs::read_to_string(p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    let p = path(app).ok_or("no app data dir")?;
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&p, json).map_err(|e| e.to_string())
}

/// http(s) only, trailing slash trimmed. Returns None for anything else.
pub fn normalize_url(url: &str) -> Option<String> {
    let trimmed = url.trim().trim_end_matches('/');
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        Some(trimmed.to_string())
    } else {
        None
    }
}
