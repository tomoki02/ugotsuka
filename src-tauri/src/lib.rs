mod balance;
mod monitored_apps;
mod monitor_enabled;
mod process_monitor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            monitored_apps::get_monitored_apps,
            monitored_apps::add_monitored_app,
            monitored_apps::add_monitored_app_from_path,
            monitored_apps::get_running_processes,
            monitored_apps::remove_monitored_app,
            monitored_apps::update_app_limit,
            balance::get_balance,
            balance::add_balance,
            balance::set_balance,
            monitor_enabled::get_monitor_enabled,
            monitor_enabled::set_monitor_enabled,
            monitored_apps::pick_executable,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            process_monitor::start_monitor_loop(app.handle().clone());

            {
                use tauri::Manager;
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;

                let show_item = MenuItem::with_id(app, "show", "開く", true, None::<&str>).ok();
                let quit_item = MenuItem::with_id(app, "quit", "終了", true, None::<&str>).ok();
                if let (Some(show), Some(quit)) = (show_item, quit_item) {
                    if let Ok(menu) = Menu::with_id_and_items(app, "tray", &[&show, &quit]) {
                        let mut builder = TrayIconBuilder::new()
                            .menu(&menu)
                            .tooltip("Playing PC Restrictions")
                            .on_menu_event(move |app, event| {
                                if event.id.as_ref() == "show" {
                                    if let Some(w) = app.get_webview_window("main") {
                                        let _ = w.show();
                                        let _ = w.set_focus();
                                    }
                                } else if event.id.as_ref() == "quit" {
                                    app.exit(0);
                                }
                            });
                        if let Some(icon) = app.default_window_icon() {
                            builder = builder.icon(icon.clone());
                        }
                        let _ = builder.build(app);
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
