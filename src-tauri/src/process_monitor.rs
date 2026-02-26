use std::collections::HashSet;
use std::process::Command;
use std::thread;
use std::time::Duration;
use sysinfo::{Pid, System};
use tauri::{AppHandle, Emitter};

const MONITOR_INTERVAL_SECS: u64 = 10;
const RESTRICTION_NOTIFICATION_EVENT: &str = "show-restriction-notification";

/// Remaining balance thresholds (in seconds) at which we notify once each.
const WARNING_THRESHOLDS_SECS: [u64; 5] = [30 * 60, 15 * 60, 5 * 60, 3 * 60, 1 * 60];

fn kill_process_windows(pid: Pid) -> bool {
    #[cfg(target_os = "windows")]
    {
        Command::new("taskkill")
            .args(["/PID", &pid.as_u32().to_string(), "/F"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
        false
    }
}

fn kill_process(pid: Pid) -> bool {
    #[cfg(target_os = "windows")]
    return kill_process_windows(pid);
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use std::process::Stdio;
        Command::new("kill")
            .arg("-9")
            .arg(pid.as_u32().to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

#[derive(Clone, serde::Serialize)]
struct RestrictionPayload {
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    minutes: Option<u32>,
}

pub fn start_monitor_loop(app: AppHandle) {
    thread::spawn(move || {
        let mut sys = System::new_all();
        let mut zero_notified = false;
        let mut warned_thresholds: HashSet<u64> = HashSet::new();

        loop {
            thread::sleep(Duration::from_secs(MONITOR_INTERVAL_SECS));

            if !super::monitor_enabled::is_enabled(&app) {
                continue;
            }

            let Ok(monitored) = super::monitored_apps::get_monitored_apps(app.clone()) else {
                continue;
            };
            let Ok(mut balance_seconds) = super::balance::load_balance(&app) else {
                continue;
            };
            let previous_balance = balance_seconds;

            sys.refresh_all();
            let processes = sys.processes();

            // Collect all PIDs that match ANY enabled monitored app (any app running = single deduction)
            let mut pids_to_kill_when_zero: HashSet<Pid> = HashSet::new();
            let mut any_running = false;

            for app_cfg in &monitored {
                if !app_cfg.enabled {
                    continue;
                }
                let process_name_lower = app_cfg.process_name.to_lowercase();
                for (pid, proc_) in processes.iter() {
                    let name = proc_.name().to_string_lossy().to_lowercase();
                    if name == process_name_lower || name.ends_with(&format!("\\{}", process_name_lower)) {
                        any_running = true;
                        pids_to_kill_when_zero.insert(*pid);
                    }
                }
            }

            // Deduct balance once per interval if any monitored app is running
            if any_running && balance_seconds > 0 {
                let deduct = balance_seconds.min(MONITOR_INTERVAL_SECS);
                balance_seconds -= deduct;
            }

            // Notify only when *crossing* a warning threshold (was above, now at or below)
            for &thresh in &WARNING_THRESHOLDS_SECS {
                if previous_balance > thresh && balance_seconds <= thresh {
                    if warned_thresholds.insert(thresh) {
                        let minutes = (thresh / 60) as u32;
                        let _ = app.emit(
                            RESTRICTION_NOTIFICATION_EVENT,
                            RestrictionPayload {
                                kind: "warning".to_string(),
                                minutes: Some(minutes),
                            },
                        );
                    }
                }
                if balance_seconds > thresh {
                    warned_thresholds.remove(&thresh);
                }
            }

            // When balance is 0, kill all matching processes; notify only when we *just* reached 0 (not on startup when already 0)
            if balance_seconds == 0 {
                let mut any_killed = false;
                for pid in &pids_to_kill_when_zero {
                    let _ = kill_process(*pid);
                    any_killed = true;
                }
                if any_killed && previous_balance > 0 && !zero_notified {
                    zero_notified = true;
                    let _ = app.emit(
                        RESTRICTION_NOTIFICATION_EVENT,
                        RestrictionPayload {
                            kind: "zero".to_string(),
                            minutes: None,
                        },
                    );
                }
            } else {
                zero_notified = false;
            }

            let _ = super::balance::save_balance(&app, balance_seconds);
        }
    });
}
