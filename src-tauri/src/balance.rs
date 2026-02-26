use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const BALANCE_FILE: &str = "balance.json";

#[derive(Debug, Serialize, Deserialize)]
struct BalanceData {
    balance_seconds: u64,
}

fn balance_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.join(BALANCE_FILE))
}

fn ensure_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn load_balance(app: &AppHandle) -> Result<u64, String> {
    let path = balance_path(app)?;
    if !path.exists() {
        return Ok(0);
    }
    let s = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: BalanceData = serde_json::from_str(&s).map_err(|e| e.to_string())?;
    Ok(data.balance_seconds)
}

pub fn save_balance(app: &AppHandle, balance_seconds: u64) -> Result<(), String> {
    ensure_app_data_dir(app)?;
    let path = balance_path(app)?;
    let data = BalanceData { balance_seconds };
    let s = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&path, s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_balance(app: AppHandle) -> Result<u64, String> {
    load_balance(&app)
}

#[tauri::command]
pub fn add_balance(app: AppHandle, seconds: u64) -> Result<u64, String> {
    let current = load_balance(&app)?;
    let new_balance = current.saturating_add(seconds);
    save_balance(&app, new_balance)?;
    Ok(new_balance)
}

#[tauri::command]
pub fn set_balance(app: AppHandle, seconds: u64) -> Result<(), String> {
    save_balance(&app, seconds)
}
