use tauri::{Emitter, Manager, Theme, WindowEvent};
use tauri::window::Color;

mod cli_detection;
mod commands;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::save_file,
            commands::read_file,
            commands::spawn_terminal,
            commands::list_directory,
            commands::open_file_in_vscode,
            commands::parse_file_url,
            cli_detection::detect_cli_profiles,
            cli_detection::validate_cli_path,
            cli_detection::install_global_cli,
            cli_detection::get_default_profiles,
            cli_detection::health_check_profiles
        ])
        .setup(|app| {
            let main_window = app.get_webview_window("main").unwrap();
            let app_handle = app.handle().clone();

            // Set up theme change listener
            main_window.on_window_event(move |event| {
                if let WindowEvent::ThemeChanged(theme) = event {
                    let is_dark = matches!(theme, Theme::Dark);
                    
                    // Update window background color
                    let bg_color = if is_dark {
                        Color(0x3c, 0x2f, 0x1e, 255) // Dark theme background
                    } else {
                        Color(255, 255, 255, 255) // Light theme background
                    };
                    
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.set_background_color(Some(bg_color));
                    }
                    
                    // Emit theme change to frontend
                    let _ = app_handle.emit("theme-changed", is_dark);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
