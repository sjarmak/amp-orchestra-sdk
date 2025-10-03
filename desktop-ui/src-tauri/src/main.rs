// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod session_commands;
mod thread_session_commands;
mod amp_auth;
mod app_state;
mod profile_auth;
mod keychain_auth;
mod cli_detection;
mod cli_auth;
mod amp_proxy;
mod terminal;
mod runtime_env;
mod env_composer;
mod toolbox_resolver;
mod toolbox_profiles;
mod exporters;
#[cfg(feature = "worktree-manager")]
mod worktree_manager;
mod session_manager;
#[cfg(feature = "worktree-manager")]
mod enhanced_session_commands;
mod batch_engine;
mod batch_commands;
mod worktree;
mod worktree_commands;
#[cfg(test)]
mod runtime_env_tests;
#[cfg(test)]
mod env_composer_tests;
#[cfg(test)]
mod toolbox_resolver_tests;

use tauri::{Window, Manager, Emitter};
use commands::*;
use session_commands::*;
use thread_session_commands::*;
use app_state::*;
use profile_auth::*;
use keychain_auth::*;
use cli_detection::*;
use cli_auth::*;
use amp_proxy::*;
use terminal::*;
use exporters::export_commands::*;
use batch_commands::*;
use worktree_commands::*;

#[tauri::command]
async fn spawn_orchestrator() -> Result<String, String> {
    // TODO: Integrate with actual amp-orchestra backend
    Ok("Orchestrator ready (mock)".to_string())
}

#[tauri::command]
async fn close_window(window: Window) {
    window.close().unwrap();
}

#[tauri::command]
async fn minimize_window(window: Window) {
    window.minimize().unwrap();
}

#[tauri::command]
async fn toggle_maximize(window: Window) {
    if window.is_maximized().unwrap() {
        window.unmaximize().unwrap();
    } else {
        window.maximize().unwrap();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:app.db", vec![
                    tauri_plugin_sql::Migration {
                        version: 1,
                        description: "create_initial_tables",
                        sql: include_str!("../migrations/001_initial.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 2,
                        description: "chat_sessions",
                        sql: include_str!("../migrations/002_chat_sessions.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                    version: 3,
                    description: "chat_sessions_agent_mode",
                    sql: include_str!("../migrations/003_chat_sessions_agent_mode.sql"),
                    kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 4,
                        description: "add_toolbox_profiles",
                        sql: include_str!("../migrations/004_add_toolbox_profiles.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 5,
                        description: "add_worktrees_support",
                        sql: include_str!("../migrations/005_add_worktrees_support.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 6,
                        description: "add_batch_processing_support",
                        sql: include_str!("../migrations/006_batch_processing.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 7,
                        description: "add_threads_architecture",
                        sql: include_str!("../migrations/007_add_threads_architecture.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    }
                ])
                .build()
        )
        .invoke_handler(tauri::generate_handler![
            spawn_orchestrator, 
            close_window, 
            minimize_window, 
            toggle_maximize,
            save_file,
            read_file,
            write_file,
            get_current_branch,
            get_file_diff,
            spawn_terminal,
            list_directory,
            open_file_in_vscode,
            parse_file_url,
            auth_status,
            session_create,
            chat_send,
            config_get,
            config_set,
            set_environment,
            get_shell_env_var,
            sessions_list,
            spawn_amp_process,
            spawn_process_raw,
            kill_process,
            process_input,
            // Runtime config commands
            get_runtime_config,
            // Agent mode commands
            set_agent_mode,
            get_agent_mode,
            // Toolbox path commands (legacy)
            set_toolbox_path,
            get_toolbox_path,
            debug_toolbox_state,
            // Toolbox profile commands
            list_toolbox_profiles,
            create_toolbox_profile,
            update_toolbox_profile,
            delete_toolbox_profile,
            set_active_toolbox_profile,
            get_active_toolbox_profile,
            migrate_toolbox_profiles,
            // CLI auth commands
            cli_login,
            get_cli_token,
            // Amp proxy commands
            amp_proxy,
            amp_proxy_simple,
            // Profile management commands
            profiles_list,
            profile_create,
            profile_update,
            profile_delete,
            profile_activate,
            list_profiles,
            activate_profile,
            get_active_profile,
            login,
            logout,
            // CLI detection commands
            detect_amp_cli_paths,
            detect_cli_profiles,
            validate_cli_path,
            install_global_cli,
            get_default_profiles,
            health_check_profiles,
            // Keychain commands
            store_profile_token,
            get_profile_token,
            delete_profile_token,
            clear_profile_tokens,
            has_profile_tokens,
            list_profile_tokens,
            get_all_profile_tokens,
            // PTY terminal commands
            cmd_start_tui,
            cmd_write_stdin,
            cmd_resize,
            cmd_kill,
            // Export commands
            export_sessions,
            export_sessions_to_file,
            // Thread-based session management commands
            new_session_create,
            thread_start,
            thread_attach,
            thread_refresh_env,
            thread_session_commands::list_sessions,
            list_threads,
            thread_send_message,
            thread_archive,
            get_thread_history,
            // Enhanced session management commands (feature-gated)
            #[cfg(feature = "worktree-manager")]
            enhanced_session_commands::enhanced_session_create,
            #[cfg(feature = "worktree-manager")]
            enhanced_session_commands::enhanced_session_start,
            #[cfg(feature = "worktree-manager")]
            enhanced_session_commands::enhanced_session_stop,
            #[cfg(feature = "worktree-manager")]
            enhanced_session_commands::enhanced_session_list,
            #[cfg(feature = "worktree-manager")]
            enhanced_session_commands::enhanced_session_status,
            #[cfg(feature = "worktree-manager")]
            enhanced_session_commands::enhanced_session_metrics,
            // Batch processing commands
            start_batch,
            cancel_batch,
            get_batch_status,
            list_active_batches,
            get_batch_results,
            // Git worktree management commands
            create_git_worktree,
            remove_git_worktree,
            get_worktree_path,
            check_repository_clean,
            list_git_worktrees
        ])
        .manage(init_session_manager())
        .manage(init_process_manager())
        .manage(session_commands::init_amp_sessions())
        .manage(batch_commands::init_batch_engine_state())
        .setup(|app| { 
            // Initialize app state with loaded configuration
            let config_state = init_app_state();
            
            tauri::async_runtime::block_on(async {
                let mut config = AppConfig::load().await;
                // Ensure default production environment when not set
                let needs_default = config.connection_mode.is_none() && config.amp_env.is_empty();
                if needs_default {
                    config.connection_mode = Some("production".to_string());
                    config.amp_env.insert("AMP_BIN".to_string(), "amp".to_string());
                    let _ = config.save().await;
                }
                // Debug dump to logs/startup-env.log
                if let Err(e) = std::fs::create_dir_all("/Users/sjarmak/amp-orchestra/logs") { eprintln!("[setup] failed to create logs dir: {}", e); }
                let dump = format!("loaded config mode: {:?} amp_env: {:?}\n", config.connection_mode, config.amp_env);
                if let Err(e) = std::fs::OpenOptions::new().create(true).append(true).open("/Users/sjarmak/amp-orchestra/logs/startup-env.log").and_then(|mut f| std::io::Write::write_all(&mut f, dump.as_bytes())) { eprintln!("[setup] failed to write startup-env.log: {}", e); }
                if let Ok(mut state) = config_state.lock() {
                    *state = config;
                }
            });
            
            app.manage(config_state);
            
            // Initialize profile manager
            log::info!("setup: Initializing profile manager");
            let profile_manager = init_profile_manager(app.handle().clone());
            app.manage(profile_manager);
            log::debug!("setup: Profile manager created and managed");

            // Initialize worktree manager if feature enabled
            #[cfg(feature = "worktree-manager")]
            {
                log::info!("setup: Initializing worktree manager");
                match tauri::async_runtime::block_on(worktree_manager::init_worktree_manager()) {
                    Ok(wt_manager) => {
                        app.manage(wt_manager);
                        log::info!("setup: Worktree manager initialized successfully");
                    }
                    Err(e) => {
                        log::error!("setup: Failed to initialize worktree manager: {}", e);
                        // Continue startup - app can function without worktree manager
                    }
                }

                // Initialize enhanced session manager
                log::info!("setup: Initializing enhanced session manager");
                match tauri::async_runtime::block_on(enhanced_session_commands::init_enhanced_session_manager(app.handle())) {
                    Ok(()) => {
                        log::info!("setup: Enhanced session manager initialized successfully");
                    }
                    Err(e) => {
                        log::error!("setup: Failed to initialize enhanced session manager: {}", e);
                        // Continue startup - app can function without enhanced session manager
                    }
                }
            }
            
            // Initialize database synchronously to prevent race conditions
            log::debug!("setup: Starting blocking database initialization");
            let app_handle = app.handle().clone();
            if let Some(manager) = app_handle.try_state::<ProfileManager>() {
                log::debug!("setup: Profile manager state acquired");
                
                // Attempt database initialization with graceful error handling
                match tauri::async_runtime::block_on(manager.initialize_db()) {
                    Ok(()) => {
                        log::info!("setup: Database initialization completed successfully");
                        
                        // Load profiles after successful database initialization
                        if let Err(e) = tauri::async_runtime::block_on(manager.load_profiles()) {
                            log::error!("setup: Failed to load profiles: {}", e);
                            // Continue startup even if profile loading fails
                            // The app can still function without existing profiles
                        } else {
                            log::debug!("setup: Profiles loaded successfully");
                        }
                        
                        // Run toolbox profile migration
                        if let Some(db) = tauri::async_runtime::block_on(manager.db_pool.read()).as_ref() {
                            use crate::toolbox_profiles::ToolboxProfileStore;
                            let store = ToolboxProfileStore::new(db.clone());
                            match tauri::async_runtime::block_on(store.migrate_single_paths()) {
                                Ok(()) => log::info!("setup: Toolbox profile migration completed"),
                                Err(e) => log::warn!("setup: Toolbox profile migration failed: {}", e),
                            }
                        }
                    },
                    Err(e) => {
                        log::error!("setup: Database initialization failed: {}", e);
                        log::warn!("setup: Application will continue without database functionality");
                        
                        // Emit an error event to the frontend so user knows about the issue
                        let _ = app_handle.emit("database_error", &e);
                        
                        // Don't fail the entire app startup due to database issues
                        // The app can still provide basic functionality without profiles
                    }
                }
            } else {
                log::error!("setup: Failed to acquire ProfileManager state");
                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other, 
                    "Failed to acquire ProfileManager state"
                )));
            }
            
            // Auto-start orchestrator on app launch
            tauri::async_runtime::spawn(spawn_orchestrator());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
