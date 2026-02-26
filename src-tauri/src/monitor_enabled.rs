use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "monitor_enabled.json";

#[derive(Debug, Serialize, Deserialize)]
struct Data {
    enabled: bool,
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())
        .map(|p: PathBuf| p.join(FILE_NAME))
}

fn ensure_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Called from process_monitor loop to check if monitoring is enabled.
pub fn is_enabled(app: &AppHandle) -> bool {
    let p = match path(app) {
        Ok(p) => p,
        Err(_) => return true, // default on if path fails
    };
    if !p.exists() {
        return true; // default on
    }
    let s = match fs::read_to_string(&p) {
        Ok(s) => s,
        Err(_) => return true,
    };
    let data: Data = match serde_json::from_str(&s) {
        Ok(d) => d,
        Err(_) => return true,
    };
    data.enabled
}

#[tauri::command]
pub fn get_monitor_enabled(app: AppHandle) -> Result<bool, String> {
    Ok(is_enabled(&app))
}

#[tauri::command]
pub fn set_monitor_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    ensure_dir(&app)?;
    let p = path(&app)?;
    let data = Data { enabled };
    let s = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&p, s).map_err(|e| e.to_string())
}
