use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Mutex},
    thread,
};

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtyPair, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use crate::env_composer::{EnvComposer, TuiSpawnComposer};
use crate::toolbox_profiles::{ToolboxProfileStore, ToolboxProfile};

struct SessionHandles {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    #[allow(dead_code)]
    reader_thread: thread::JoinHandle<()>,
    #[allow(dead_code)]
    child: Box<dyn portable_pty::Child + Send>,
}

static SESSIONS: once_cell::sync::Lazy<Arc<Mutex<HashMap<String, SessionHandles>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

#[derive(Serialize, Clone)]
struct PtyData {
    id: String,
    chunk: String,
}

fn login_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

fn open_pty(cols: u16, rows: u16) -> anyhow::Result<PtyPair> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;
    Ok(pair)
}

// Build environment for TUI session using compose_runtime_env
async fn build_tui_env_from_state(
    app_state: &State<'_, crate::app_state::AppState>,
    profile_manager: &State<'_, crate::profile_auth::ProfileManager>
) -> anyhow::Result<(HashMap<String, String>, Option<ToolboxProfile>)> {
    // Get active toolbox profile if available
    let profile_id = {
        let state = app_state.lock().unwrap();
        state.active_toolbox_profile_id
    };
    
    let toolbox_profile = if let Some(profile_id) = profile_id {
        match profile_manager.db_pool.read().await.as_ref() {
            Some(pool) => {
                let store = ToolboxProfileStore::new(pool.clone());
                store.get_profile(profile_id).await.ok().flatten()
            }
            None => None
        }
    } else {
        None
    };
    
    // Start with base environment from app config
    let mut env = {
        let state = app_state.lock().unwrap();
        state.compose_env()
    };
    
    // Apply TUI-specific environment composition with toolbox support
    let composer = TuiSpawnComposer;
    let _result = composer.compose_env(&mut env, toolbox_profile.as_ref())?;
    
    Ok((env, toolbox_profile))
}

fn resolve_simple_shell() -> String {
    // Just return the user's default shell - no amp command launching
    login_shell()
}

#[tauri::command]
pub async fn cmd_start_tui(
    app: AppHandle,
    profile: String,
    variant_id: Option<String>,
    cwd: Option<String>, 
    cols: u16,
    rows: u16,
    env: Option<HashMap<String, String>>,
    _app_state: State<'_, crate::app_state::AppState>,
    _profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<String, String> {
    // Generate unique session ID
    let session_id = match variant_id {
        Some(variant) => format!("{}_{}", profile, variant),
        None => format!("{}_default", profile),
    };

    // If a session with this id already exists, just reuse it (no new PTY)
    if SESSIONS.lock().unwrap().contains_key(&session_id) {
        println!("[cmd_start_tui] Reusing existing session {}", session_id);
        return Ok(session_id);
    }

    let pair = open_pty(cols, rows).map_err(|e| e.to_string())?;

    // Use minimal environment - just get the user's default shell
    let mut tui_env = std::env::vars().collect::<HashMap<String, String>>();
    
    // Merge in any additional env vars passed from frontend
    if let Some(extra_env) = env {
        for (k, v) in extra_env {
            tui_env.insert(k, v);
        }
    }
    
    // Just launch the user's default shell directly
    let shell_cmd = resolve_simple_shell();
    let mut cmd = CommandBuilder::new(&shell_cmd);

    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }
    
    // Set basic environment variables
    for (k, v) in tui_env.iter() {
        cmd.env(k, v);
    }
    // Ensure proper terminal capabilities 
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    // Check if session already exists for this profile
    if SESSIONS.lock().unwrap().contains_key(&session_id) {
        println!("Session {} already exists, reusing", session_id);
        return Ok(session_id);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn failed: {e}"))?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    let reader_thread = thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit("terminal://data", PtyData {
                        id: session_id_clone.clone(),
                        chunk,
                    });
                }
                Err(_) => break,
            }
        }
    });

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    SESSIONS.lock().unwrap().insert(
        session_id.clone(),
        SessionHandles {
            master: pair.master,
            writer,
            reader_thread,
            child,
        },
    );

    Ok(session_id)
}

#[tauri::command]
pub fn cmd_write_stdin(session_id: String, utf8_chunk: String) -> Result<(), String> {
    if let Some(session) = SESSIONS.lock().unwrap().get_mut(&session_id) {
        session
            .writer
            .write_all(utf8_chunk.as_bytes())
            .map_err(|e| e.to_string())?;
        session.writer.flush().ok();
        Ok(())
    } else {
        Err("no such session".into())
    }
}

#[tauri::command]
pub fn cmd_resize(session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    if let Some(session) = SESSIONS.lock().unwrap().get_mut(&session_id) {
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        session
            .master
            .resize(size)
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("no such session".into())
    }
}

#[tauri::command]
pub fn cmd_kill(session_id: String) -> Result<(), String> {
    match SESSIONS.lock().unwrap().remove(&session_id) {
        Some(_session) => {
            // Dropping handles ends the session; best-effort Ctrl-C first
            // Ignore errors if writer already closed
            // Note: _session is dropped at end of scope
            log::info!("Successfully killed session: {}", session_id);
            Ok(())
        }
        None => {
            // Session doesn't exist, but this is not necessarily an error
            // It might have already been cleaned up or never existed
            log::warn!("Session not found during kill, may already be cleaned up: {}", session_id);
            Ok(())
        }
    }
}
