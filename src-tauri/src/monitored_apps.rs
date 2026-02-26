use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use sysinfo::System;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoredApp {
    pub id: String,
    pub name: String,
    pub process_name: String,
    pub daily_limit_minutes: u32,
    pub enabled: bool,
    #[serde(default)]
    pub exe_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct StoredData {
    apps: Vec<MonitoredApp>,
}

fn data_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.join("monitored_apps.json"))
}

fn ensure_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn load_data(app: &AppHandle) -> Result<StoredData, String> {
    let path = data_path(app)?;
    if !path.exists() {
        return Ok(StoredData { apps: vec![] });
    }
    let s = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

fn save_data(app: &AppHandle, data: &StoredData) -> Result<(), String> {
    ensure_app_data_dir(app)?;
    let path = data_path(app)?;
    let s = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&path, s).map_err(|e| e.to_string())
}

fn next_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("app_{}", t)
}

#[tauri::command]
pub fn get_monitored_apps(app: AppHandle) -> Result<Vec<MonitoredApp>, String> {
    let data = load_data(&app)?;
    Ok(data.apps)
}

#[tauri::command]
pub fn add_monitored_app(
    app: AppHandle,
    name: String,
    process_name: String,
    daily_limit_minutes: u32,
    exe_path: Option<String>,
) -> Result<MonitoredApp, String> {
    if name.trim().is_empty() {
        return Err("アプリ名を入力してください".to_string());
    }
    if process_name.trim().is_empty() {
        return Err("プロセス名を入力してください".to_string());
    }
    let mut data = load_data(&app)?;
    let id = next_id();
    let monitored = MonitoredApp {
        id: id.clone(),
        name: name.trim().to_string(),
        process_name: process_name.trim().to_string(),
        daily_limit_minutes,
        enabled: true,
        exe_path: exe_path.clone(),
    };
    data.apps.push(monitored.clone());
    save_data(&app, &data)?;
    Ok(monitored)
}

#[tauri::command]
pub fn remove_monitored_app(app: AppHandle, id: String) -> Result<(), String> {
    let mut data = load_data(&app)?;
    let len_before = data.apps.len();
    data.apps.retain(|a| a.id != id);
    if data.apps.len() == len_before {
        return Err("指定したアプリが見つかりません".to_string());
    }
    save_data(&app, &data)
}

#[tauri::command]
pub fn update_app_limit(
    app: AppHandle,
    id: String,
    daily_limit_minutes: u32,
) -> Result<MonitoredApp, String> {
    let mut data = load_data(&app)?;
    let updated = {
        let found = data
            .apps
            .iter_mut()
            .find(|a| a.id == id)
            .ok_or_else(|| "指定したアプリが見つかりません".to_string())?;
        found.daily_limit_minutes = daily_limit_minutes;
        found.clone()
    };
    save_data(&app, &data)?;
    Ok(updated)
}

#[derive(serde::Serialize)]
pub struct RunningProcessInfo {
    pub name: String,
    pub exe_path: Option<String>,
}

#[tauri::command]
pub fn get_running_processes() -> Result<Vec<RunningProcessInfo>, String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    let mut seen = HashSet::new();
    let mut list = Vec::new();
    for (_, proc_) in sys.processes() {
        let name = proc_.name().to_string_lossy();
        if name.is_empty() || name.len() > 100 {
            continue;
        }
        let name_lower = name.to_lowercase();
        if seen.contains(&name_lower) {
            continue;
        }
        seen.insert(name_lower.clone());
        let exe_path = proc_
            .exe()
            .map(|p| p.to_string_lossy().to_string());
        list.push(RunningProcessInfo {
            name: name.to_string(),
            exe_path,
        });
    }
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(list)
}

#[tauri::command]
pub fn pick_executable(app: AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("実行ファイル", &["exe"])
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub fn add_monitored_app_from_path(
    app: AppHandle,
    path: String,
    name: Option<String>,
) -> Result<MonitoredApp, String> {
    let path = PathBuf::from(&path);
    let process_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    if process_name.is_empty() {
        return Err("無効なパスです".to_string());
    }
    let display_name = name.unwrap_or_else(|| {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&process_name)
            .to_string()
    });
    let exe_path_str = path.to_string_lossy().to_string();
    let added = add_monitored_app(app.clone(), display_name, process_name, 0, Some(exe_path_str))?;
    Ok(added)
}
