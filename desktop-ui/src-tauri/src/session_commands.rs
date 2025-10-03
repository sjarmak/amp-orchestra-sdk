use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::fs;
use std::env;
use tauri::{AppHandle, State, Emitter};
use tokio::process::{Command, Child};
use tokio::io::{AsyncBufReadExt, BufReader, BufWriter, AsyncWriteExt};
use serde_json::Value;
use uuid::Uuid;
use crate::toolbox_profiles::{ToolboxProfile, ToolboxProfileStore, CreateToolboxProfileRequest, UpdateToolboxProfileRequest};


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionConfig {
    pub working_directory: Option<String>,
    pub model_override: Option<String>,
    pub agent_id: Option<String>,
    pub auto_route: Option<bool>,
    pub alloy_mode: Option<bool>,
    pub multi_provider: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SendMessageOptions {
    pub session_id: String,
    pub prompt: String,
    pub working_directory: Option<String>,
    pub model_override: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConfigUpdate {
    pub key: String,
    pub value: Value,
}

// Process management
type ProcessHandle = Arc<std::sync::Mutex<Child>>;
type ProcessManager = Arc<std::sync::Mutex<HashMap<String, ProcessHandle>>>;

// Legacy session manager (thread id storage) - no longer used for streaming
type SessionManager = Arc<std::sync::Mutex<HashMap<String, String>>>;

// Persistent Amp streaming session state
use tokio::sync::mpsc;

pub struct AmpSession {
    pub child: Child,
    pub tx: mpsc::UnboundedSender<String>,
    pub toolbox_guard: Option<crate::toolbox_resolver::ToolboxGuard>,
    #[cfg(feature = "worktree-manager")]
    pub worktree_guard: Option<crate::worktree_manager::WorktreeGuard>,
}

pub type AmpSessionMap = Arc<Mutex<HashMap<String, AmpSession>>>;

// Initialize managers in Tauri state
pub fn init_session_manager() -> SessionManager {
    Arc::new(std::sync::Mutex::new(HashMap::new()))
}

pub fn init_process_manager() -> ProcessManager {
    Arc::new(std::sync::Mutex::new(HashMap::new()))
}

pub fn init_amp_sessions() -> AmpSessionMap {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Generate the worktree path for a given session ID
fn path_for(repo_path: &std::path::Path, session_id: &str) -> std::path::PathBuf {
    let short_sid = &session_id[..session_id.len().min(8)];
    repo_path.join(".amp-worktrees").join(short_sid)
}

/// Helper function to get session worktree path
/// Falls back to current directory if session worktree cannot be determined
async fn get_session_worktree_path(session_id: Option<&str>) -> PathBuf {
    if let Some(session_id) = session_id {
        // Try to find the repository root from current directory
        if let Ok(current_dir) = std::env::current_dir() {
            if let Ok(repo_path) = find_repo_root(&current_dir) {
                let worktree_path = path_for(&repo_path, session_id);
                if worktree_path.exists() {
                    return worktree_path;
                }
                // If worktree doesn't exist, return repo root
                return repo_path;
            }
        }
    }
    // Default fallback to current directory
    std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
}

/// Find the Git repository root starting from a given path
fn find_repo_root(start_path: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let mut current_path = start_path;
    
    loop {
        if current_path.join(".git").exists() {
            return Ok(current_path.to_path_buf());
        }
        
        match current_path.parent() {
            Some(parent) => current_path = parent,
            None => return Err("No Git repository found".to_string()),
        }
    }
}

#[tauri::command]
pub async fn auth_status(
    app_handle: tauri::AppHandle,
    app_state: State<'_, crate::app_state::AppState>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
    session_id: Option<String>,
) -> Result<crate::amp_auth::AuthStatus, String> {
    use crate::amp_auth::{ensure_auth, ResolvedConfig};
    
    // Always prefer app state over profiles when connection_mode is explicitly set
    let prefer_app_state = {
        let state = app_state.lock().unwrap();
        state.connection_mode.is_some()
    };

    if !prefer_app_state {
        // Try to use active profile first
        if let Some(active_profile) = profile_manager.get_active_profile().await {
            let profile_ctx = active_profile.read().await;
            let config = profile_ctx.to_resolved_config();
            return ensure_auth(&app_handle, &config).await;
        }
    }
    
    // Fallback to legacy app state behavior
    let (merged_env, connection_mode) = {
        let state = app_state.lock().unwrap();
        (state.get_merged_env(), state.connection_mode.clone())
    };
    
    let mut config = ResolvedConfig::from_env_with_overrides(merged_env);
    // Override connection mode with app state value if set
    if let Some(mode) = connection_mode {
        config.override_connection_mode(mode);
    }
    
    // Use session worktree path if session_id is provided
    if let Some(session_id) = session_id {
        let worktree_path = get_session_worktree_path(Some(&session_id)).await;
        config.cwd = worktree_path;
    }
    
    ensure_auth(&app_handle, &config).await
}

fn build_env_from_state(app_state: &State<'_, crate::app_state::AppState>) -> HashMap<String, String> {
    let base = {
        let state = app_state.lock().unwrap();
        state.compose_env()
    };

    let mut merged_env = base;
    merged_env.insert("AMP_DEBUG".to_string(), "true".to_string());
    merged_env
}

pub fn choose_amp_command(env: &HashMap<String, String>) -> (String, Vec<String>) {

    if let Some(path) = env.get("AMP_CLI_PATH") {
        // Local CLI: node path/to/main.js --execute --stream-json --stream-json-input
        ("node".to_string(), vec![
            "--enable-source-maps".into(),
            "--no-warnings".into(), 
            "--unhandled-rejections=strict".into(),
            "--max-old-space-size=2048".into(),
            "--experimental-json-modules".into(),
            path.clone(),
            "--execute".into(),
            "--stream-json".into(),
            "--stream-json-input".into()
        ])
    } else {
        // Production: amp --execute --stream-json --stream-json-input
        (env.get("AMP_BIN").cloned().unwrap_or_else(|| "amp".into()), vec![
            "--execute".into(),
            "--stream-json".into(),
            "--stream-json-input".into()
        ])
    }
}

#[tauri::command]
pub async fn session_create(
    config: SessionConfig,
    app_handle: AppHandle,
    app_state: State<'_, crate::app_state::AppState>,
    amp_sessions: State<'_, AmpSessionMap>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();

    // Build env and choose command
    let mut merged_env = build_env_from_state(&app_state);
    // Compose runtime env (toolboxes, etc.) using the new EnvComposer system
    // This will use ChatSpawnComposer for backward compatibility
    let compose = crate::runtime_env::compose_runtime_env(&mut merged_env).map_err(|e| e.to_string())?;

    // Ensure AMP_API_KEY is present by reading shell config if missing
    if !merged_env.contains_key("AMP_API_KEY") {
        if let Ok(Some(api_key)) = get_shell_env_var("AMP_API_KEY".to_string()).await {
            merged_env.insert("AMP_API_KEY".to_string(), api_key);
        }
    }

    // Diagnostics
    {
        let mut diag = String::new();
        let (mode, cli_path, srv_url) = {
            let state = app_state.lock().unwrap();
            (state.connection_mode.clone(), state.custom_cli_path.clone(), state.local_server_url.clone())
        };
        diag.push_str(&format!(
            "timestamp={} env.AMP_CLI_PATH={:?} env.AMP_BIN={:?} env.AMP_URL={:?} mode={:?} cli_path={:?} server_url={:?} session={}\n",
            chrono::Utc::now().timestamp_millis(),
            merged_env.get("AMP_CLI_PATH"),
            merged_env.get("AMP_BIN"),
            merged_env.get("AMP_URL"),
            mode, cli_path, srv_url, session_id
        ));
        let _ = std::fs::create_dir_all("/Users/sjarmak/amp-orchestra/logs");
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open("/Users/sjarmak/amp-orchestra/logs/ui-connection.log")
            .and_then(|mut f| std::io::Write::write_all(&mut f, diag.as_bytes()));
    }

    let (cmd, args) = choose_amp_command(&merged_env);

    // Insert session metadata into DB
    let context_label = {
        let state = app_state.lock().unwrap();
        match state.connection_mode.as_deref() { Some("local-cli") => "development", _ => "production" }.to_string()
    };
    if let Some(db) = profile_manager.db_pool.read().await.as_ref() {
        // Determine current agent mode and toolbox path from app state env
        let (agent_mode, toolbox_path): (Option<String>, Option<String>) = {
            let state = app_state.lock().unwrap();
            (
                state.amp_env.get("AMP_EXPERIMENTAL_AGENT_MODE").cloned(),
                state.amp_env.get("AMP_TOOLBOX_PATHS").cloned()
            )
        };
        let _ = sqlx::query("INSERT OR IGNORE INTO chat_sessions (id, context, title, agent_mode, toolbox_path) VALUES (?, ?, ?, ?, ?)")
            .bind(&session_id)
            .bind(&context_label)
            .bind("New chat")
            .bind(&agent_mode)
            .bind(&toolbox_path)
            .execute(db)
            .await;
    }

    // Determine the working directory for the Amp session
    let working_dir = if let Some(working_directory) = &config.working_directory {
        // Use the provided working directory from the config
        PathBuf::from(working_directory)
    } else {
        // Fall back to session worktree path
        get_session_worktree_path(Some(&session_id)).await
    };

    let mut child = Command::new(&cmd)
        .args(&args)
        .env_clear()
        .envs(&merged_env)
        .current_dir(working_dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn amp process: {}", e))?;

    let stdin = child.stdin.take().ok_or_else(|| "Failed to open stdin".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "Failed to open stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Failed to open stderr".to_string())?;

    // Spawn writer task
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    tokio::spawn(async move {
        let mut writer = BufWriter::new(stdin);
        while let Some(line) = rx.recv().await {
            if writer.write_all(line.as_bytes()).await.is_err() { break; }
            if writer.write_all(b"\n").await.is_err() { break; }
            if writer.flush().await.is_err() { break; }
        }
    });

    // Create worktree if worktree manager is available
    #[cfg(feature = "worktree-manager")]
    let worktree_guard = {
        use crate::worktree_manager::TauriWorktreeManager;
        use tauri::Manager;
        
        if let Some(wt_manager) = app_handle.try_state::<TauriWorktreeManager>() {
            match wt_manager.create_session_worktree(&session_id, None).await {
                Ok(guard) => {
                    log::info!("Created worktree for session {} at {}", session_id, guard.worktree_path().display());
                    Some(guard)
                }
                Err(e) => {
                    log::error!("Failed to create worktree for session {}: {}", session_id, e);
                    None
                }
            }
        } else {
            log::debug!("Worktree manager not available, session {} will run in main repo", session_id);
            None
        }
    };
    
    // Store session
    {
        let mut map = amp_sessions.lock().await;
        map.insert(session_id.clone(), AmpSession { 
            child, 
            tx, 
            toolbox_guard: compose.guard,
            #[cfg(feature = "worktree-manager")]
            worktree_guard,
        });
    }

    // Reader for stdout
    let window = app_handle.clone();
    let sid_stdout = session_id.clone();
    let db_pool_for_stdout = profile_manager.db_pool.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Ok(parsed) = serde_json::from_str::<Value>(&line) {
                // Update session title/last_snippet heuristics
                if let Some(t) = parsed.get("type").and_then(|v| v.as_str()) {
                    if t == "assistant" {
                        // Extract text
                        let mut text = String::new();
                        if let Some(content) = parsed.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
                            for part in content {
                                if let Some(s) = part.get("text").and_then(|x| x.as_str()) { text.push_str(s); }
                            }
                        } else if let Some(s) = parsed.get("text").and_then(|x| x.as_str()) { text.push_str(s); }
                        if !text.is_empty() {
                            if let Some(db) = db_pool_for_stdout.read().await.as_ref() {
                                let snippet = if text.len() > 120 { format!("{}…", &text[..120]) } else { text.clone() };
                                let _ = sqlx::query("UPDATE chat_sessions SET last_snippet = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                                    .bind(&snippet)
                                    .bind(&sid_stdout)
                                    .execute(db)
                                    .await;
                            }
                        }
                    } else if t == "user" {
                        if let Some(db) = db_pool_for_stdout.read().await.as_ref() {
                            if let Some(prompt) = parsed.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()).and_then(|arr| arr.get(0)).and_then(|p| p.get("text")).and_then(|x| x.as_str()) {
                                let title = if prompt.len() > 60 { format!("{}…", &prompt[..60]) } else { prompt.to_string() };
                                let _ = sqlx::query("UPDATE chat_sessions SET title = COALESCE(NULLIF(title,'New chat'), ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                                    .bind(&title)
                                    .bind(&sid_stdout)
                                    .execute(db)
                                    .await;
                            }
                        }
                    }
                }
                let _ = window.emit("chat_stream", serde_json::json!({
                    "session_id": sid_stdout,
                    "event": parsed,
                    "timestamp": chrono::Utc::now().timestamp_millis()
                }));
            } else {
                // Non-JSON line from CLI; forward as error_output
                let _ = window.emit("chat_stream", serde_json::json!({
                    "session_id": sid_stdout,
                    "event": { "type": "error_output", "data": { "content": line } },
                    "timestamp": chrono::Utc::now().timestamp_millis()
                }));
            }
        }
        let _ = window.emit("chat_stream", serde_json::json!({
            "session_id": sid_stdout,
            "event": { "type": "result", "data": { "ended": true } },
            "timestamp": chrono::Utc::now().timestamp_millis()
        }));
    });

    // Reader for stderr
    let window_err = app_handle.clone();
    let sid_stderr = session_id.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = window_err.emit("chat_stream", serde_json::json!({
                "session_id": sid_stderr,
                "event": { "type": "error_output", "data": { "content": line } },
                "timestamp": chrono::Utc::now().timestamp_millis()
            }));
        }
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn chat_send(
    options: SendMessageOptions,
    amp_sessions: State<'_, AmpSessionMap>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<(), String> {
    let map = amp_sessions.lock().await;
    let session = map.get(&options.session_id).ok_or_else(|| format!("Session {} not found", options.session_id))?;

    let payload = serde_json::json!({
        "type": "user",
        "message": {
            "role": "user",
            "content": [{ "type": "text", "text": options.prompt }]
        }
    });

    // Update title on first prompt if needed
    if let Some(db) = profile_manager.db_pool.read().await.as_ref() {
        let title = if options.prompt.len() > 60 { format!("{}…", &options.prompt[..60]) } else { options.prompt.clone() };
        let _ = sqlx::query("UPDATE chat_sessions SET title = COALESCE(NULLIF(title,'New chat'), ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(&title)
            .bind(&options.session_id)
            .execute(db)
            .await;
    }

    // Send via writer task
    session.tx.send(payload.to_string()).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn config_get(
    key: Option<String>,
    session_id: Option<String>,
    app_state: State<'_, crate::app_state::AppState>,
) -> Result<Value, String> {
    // unchanged

    let script = match key {
        Some(k) => format!(r#"
            const {{ getConfigValue }} = require('../../node_modules/.pnpm/node_modules/@ampsm/amp-backend-core/dist/config.js');
            getConfigValue('{}').then(value => {{
                console.log(JSON.stringify({{ key: '{}', value: value }}));
            }}).catch(err => {{
                console.error('CONFIG_ERROR:' + err.message);
            }});
        "#, k, k),
        None => r#"
            const { loadConfig, redactConfigSecrets } = require('../../node_modules/.pnpm/node_modules/@ampsm/amp-backend-core/dist/config.js');
            loadConfig().then(config => {
                const redacted = redactConfigSecrets(config);
                console.log(JSON.stringify({ config: redacted }));
            }).catch(err => {
                console.error('CONFIG_ERROR:' + err.message);
            });
        "#.to_string()
    };

    let merged_env = {
        let state = app_state.lock().unwrap();
        state.get_merged_env()
    };

    // Get session worktree path for command execution
    let working_dir = get_session_worktree_path(session_id.as_deref()).await;

    let output = Command::new("node")
        .arg("-e")
        .arg(&script)
        .current_dir(working_dir)
        .envs(merged_env) // Use merged environment from app state
        .output()
        .await
        .map_err(|e| format!("Failed to execute config get: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Config get failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse config result: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn config_set(
    key: String, 
    value: Value,
    session_id: Option<String>,
    app_state: State<'_, crate::app_state::AppState>,
) -> Result<(), String> {
    let script = format!(r#"
        const {{ setConfigValue }} = require('../../node_modules/.pnpm/node_modules/@ampsm/amp-backend-core/dist/config.js');
        setConfigValue('{}', {}).then(() => {{
            console.log('CONFIG_SET_SUCCESS');
        }}).catch(err => {{
            console.error('CONFIG_ERROR:' + err.message);
        }});
    "#, key, serde_json::to_string(&value).unwrap());

    let merged_env = {
        let state = app_state.lock().unwrap();
        state.get_merged_env()
    };

    // Get session worktree path for command execution
    let working_dir = get_session_worktree_path(session_id.as_deref()).await;

    let output = Command::new("node")
        .arg("-e")
        .arg(&script)
        .current_dir(working_dir)
        .envs(merged_env) // Use merged environment from app state
        .output()
        .await
        .map_err(|e| format!("Failed to execute config set: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Config set failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if !stdout.contains("CONFIG_SET_SUCCESS") {
        return Err("Config set did not complete successfully".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn set_environment(
    mode: String,
    cli_path: Option<String>,
    server_url: Option<String>,
    token: Option<String>,
    app_state: State<'_, crate::app_state::AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // Normalize modes: accept 'development' as alias for 'local-cli'
    let normalized_mode = if mode == "development" { "local-cli".to_string() } else { mode.clone() };

    // Update the state
    {
        let mut state = app_state.lock().unwrap();
        
        // Set connection mode (normalized)
        state.connection_mode = Some(normalized_mode.clone());
        
        // Set custom CLI path or clear it for production mode
        if normalized_mode == "local-cli" {
            let path = cli_path.unwrap_or_else(|| "/Users/sjarmak/amp/cli/dist/main.js".to_string());
            state.custom_cli_path = Some(path.clone());
            state.set_env("AMP_CLI_PATH".to_string(), path);
            // Clear AMP_BIN when using local CLI
            state.amp_env.remove("AMP_BIN");
        } else {
            // Production
            state.custom_cli_path = None;
            state.amp_env.remove("AMP_CLI_PATH");
            state.set_env("AMP_BIN".to_string(), "amp".to_string());
        }
        
        // Set server URL or clear it for production mode
        if let Some(url) = server_url {
            state.local_server_url = Some(url.clone());
            state.set_env("AMP_URL".to_string(), url);
            // Also set TLS rejection for local development
            state.set_env("NODE_TLS_REJECT_UNAUTHORIZED".to_string(), "0".to_string());
        } else if normalized_mode == "production" {
            // Clear server URL for production mode
            state.local_server_url = None;
            state.amp_env.remove("AMP_URL");
            state.amp_env.remove("NODE_TLS_REJECT_UNAUTHORIZED");
        }
        
        // Set token
        if let Some(token_value) = token {
            state.set_env("AMP_TOKEN".to_string(), token_value);
        }
    }

    // Save configuration to disk (outside the lock)
    let config_to_save = {
        let state = app_state.lock().unwrap();
        state.clone()
    };
    config_to_save.save().await?;

    // Notify frontend of environment change
    let _ = app_handle.emit("env_changed", serde_json::json!({
        "connection_mode": normalized_mode
    }));

    Ok(())
}

#[tauri::command]
pub async fn set_agent_mode(
    mode: Option<String>,
    app_state: State<'_, crate::app_state::AppState>,
) -> Result<(), String> {
    {
        let mut state = app_state.lock().unwrap();
        if let Some(m) = mode {
            state.set_env("AMP_EXPERIMENTAL_AGENT_MODE".to_string(), m);
        } else {
            state.amp_env.remove("AMP_EXPERIMENTAL_AGENT_MODE");
        }
    }
    let to_save = { let state = app_state.lock().unwrap(); state.clone() };
    to_save.save().await?;
    Ok(())
}

#[tauri::command]
pub async fn get_agent_mode(
    app_state: State<'_, crate::app_state::AppState>,
) -> Result<Option<String>, String> {
    let mode = {
        let state = app_state.lock().unwrap();
        state.amp_env.get("AMP_EXPERIMENTAL_AGENT_MODE").cloned()
    };
    Ok(mode)
}

#[tauri::command]
pub async fn set_toolbox_path(
    path: Option<String>,
    app_state: State<'_, crate::app_state::AppState>,
) -> Result<(), String> {
    {
        let mut state = app_state.lock().unwrap();
        if let Some(p) = path {
            state.set_env("AMP_TOOLBOX_PATHS".to_string(), p);
        } else {
            state.amp_env.remove("AMP_TOOLBOX_PATHS");
        }
    }
    let to_save = { let state = app_state.lock().unwrap(); state.clone() };
    to_save.save().await?;
    Ok(())
}

#[tauri::command]
pub async fn get_toolbox_path(
    app_state: State<'_, crate::app_state::AppState>,
) -> Result<Option<String>, String> {
    let path = {
        let state = app_state.lock().unwrap();
        state.amp_env.get("AMP_TOOLBOX_PATHS").cloned()
    };
    Ok(path)
}

#[tauri::command]
pub async fn debug_toolbox_state(
    app_state: State<'_, crate::app_state::AppState>,
) -> Result<serde_json::Value, String> {
    use serde_json::json;
    
    let state = app_state.lock().unwrap();
    let toolbox_paths = state.amp_env.get("AMP_TOOLBOX_PATHS").cloned();
    let toolboxes_enabled = state.amp_env.get("AMP_ENABLE_TOOLBOXES").cloned();
    let all_env_keys: Vec<String> = state.amp_env.keys().cloned().collect();
    
    // Check system environment too
    let sys_toolbox_enabled = std::env::var("AMP_ENABLE_TOOLBOXES").ok();
    
    Ok(json!({
        "app_state": {
            "toolbox_paths": toolbox_paths,
            "toolboxes_enabled": toolboxes_enabled,
            "all_env_keys": all_env_keys
        },
        "system_env": {
            "toolboxes_enabled": sys_toolbox_enabled
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::choose_amp_command;
    use std::collections::HashMap;

    #[test] 
    fn test_toolbox_path_persistence() {
        use std::sync::{Arc, Mutex};
        use crate::app_state::AppConfig;
        
        let config = AppConfig::default();
        let app_state = Arc::new(Mutex::new(config));
        
        // Initially no toolbox path
        {
            let state = app_state.lock().unwrap();
            assert!(state.amp_env.get("AMP_TOOLBOX_PATHS").is_none());
        }
        
        // Set toolbox path
        {
            let mut state = app_state.lock().unwrap();
            state.set_env("AMP_TOOLBOX_PATHS".to_string(), "/path/to/toolbox".to_string());
        }
        
        // Verify it's set
        {
            let state = app_state.lock().unwrap();
            assert_eq!(state.amp_env.get("AMP_TOOLBOX_PATHS"), Some(&"/path/to/toolbox".to_string()));
        }
        
        // Remove toolbox path
        {
            let mut state = app_state.lock().unwrap();
            state.amp_env.remove("AMP_TOOLBOX_PATHS");
        }
        
        // Verify it's removed
        {
            let state = app_state.lock().unwrap();
            assert!(state.amp_env.get("AMP_TOOLBOX_PATHS").is_none());
        }
    }

    #[test]
    fn choose_command_uses_node_when_amp_cli_path_set() {
        let mut env = HashMap::new();
        env.insert("AMP_CLI_PATH".into(), "/tmp/cli/main.js".into());
        let (cmd, args) = choose_amp_command(&env);
        assert_eq!(cmd, "node");
        assert!(args.iter().any(|a| a == "/tmp/cli/main.js"));
        assert!(args.contains(&"--stream-json".to_string()));
    }

    #[test]
    fn choose_command_uses_amp_bin_otherwise() {
        let mut env = HashMap::new();
        env.insert("AMP_BIN".into(), "amp".into());
        let (cmd, args) = choose_amp_command(&env);
        assert_eq!(cmd, "amp");
        assert!(args.contains(&"--stream-json".to_string()));
    }
}

// List chat sessions
#[tauri::command]
pub async fn sessions_list(
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<Vec<serde_json::Value>, String> {
     if let Some(db) = profile_manager.db_pool.read().await.as_ref() {
     use sqlx::Row;
     let rows = sqlx::query("SELECT id, context, title, last_snippet, agent_mode, toolbox_path, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC")
     .fetch_all(db)
     .await
         .map_err(|e| e.to_string())?;
     let out = rows.into_iter().map(|r| serde_json::json!({
     "id": r.try_get::<String, _>("id").unwrap_or_default(),
     "context": r.try_get::<String, _>("context").unwrap_or_default(),
     "title": r.try_get::<String, _>("title").ok(),
     "last_snippet": r.try_get::<String, _>("last_snippet").ok(),
     "agent_mode": r.try_get::<String, _>("agent_mode").ok(),
     "toolbox_path": r.try_get::<String, _>("toolbox_path").ok(),
     "created_at": r.try_get::<String, _>("created_at").unwrap_or_default(),
         "updated_at": r.try_get::<String, _>("updated_at").unwrap_or_default(),
     })).collect();
         Ok(out)
     } else {
         Ok(vec![])
    }
 }
 
 #[tauri::command]
 pub async fn spawn_amp_process(
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    session_id: String,
    app_handle: AppHandle,
    process_manager: State<'_, ProcessManager>,
) -> Result<String, String> {
    let process_id = Uuid::new_v4().to_string();
    
    println!("[spawn_amp_process] Starting process spawn");
    println!("[spawn_amp_process] Command: {}", command);
    println!("[spawn_amp_process] Args: {:?}", args);
    println!("[spawn_amp_process] Environment variables ({}): {:?}", env.len(), 
        env.iter().map(|(k, v)| {
            if k == "AMP_TOKEN" {
                format!("{}=[REDACTED:{}]", k, v.len())
            } else {
                format!("{}={}", k, v)
            }
        }).collect::<Vec<_>>()
    );
    println!("[spawn_amp_process] Session ID: {}, Process ID: {}", session_id, process_id);
    
    // Create the command
    let mut cmd = Command::new(&command);
    
    // Add shell environment variable if missing
    let mut final_env = env.clone();
    if !final_env.contains_key("AMP_API_KEY") {
        if let Ok(Some(api_key)) = get_shell_env_var("AMP_API_KEY".to_string()).await {
            final_env.insert("AMP_API_KEY".to_string(), api_key.clone());
            println!("[spawn_amp_process] Added AMP_API_KEY from shell config");
            
            // Persist the key in the parent environment so subsequent processes can access it
            std::env::set_var("AMP_API_KEY", &api_key);
        }
    }
    
    // Only add NODE_TLS_REJECT_UNAUTHORIZED=0 when AMP_URL points to a local HTTPS dev server
    if !final_env.contains_key("NODE_TLS_REJECT_UNAUTHORIZED") {
        if let Some(url) = final_env.get("AMP_URL") {
            let url_lc = url.to_lowercase();
            let is_local_https = url_lc.starts_with("https://localhost") || url_lc.starts_with("https://127.0.0.1");
            if is_local_https {
                final_env.insert("NODE_TLS_REJECT_UNAUTHORIZED".to_string(), "0".to_string());
                println!("[spawn_amp_process] Added NODE_TLS_REJECT_UNAUTHORIZED=0 for local HTTPS");
            }
        }
    }

    // Ensure AMP_URL defaults to production if not provided
    final_env.entry("AMP_URL".to_string()).or_insert_with(|| {
        println!("[spawn_amp_process] No AMP_URL provided, defaulting to https://ampcode.com/");
        "https://ampcode.com/".to_string()
    });
    
    println!(
        "[spawn_amp_process] AMP_API_KEY present? {}",
        final_env.contains_key("AMP_API_KEY")
    );
    
    // Get session worktree path for command execution
    let working_dir = get_session_worktree_path(Some(&session_id)).await;
    println!("[spawn_amp_process] Using working directory: {}", working_dir.display());
    
    cmd.args(&args)
       .current_dir(working_dir)
       .envs(&final_env)
       .stdin(std::process::Stdio::piped())
       .stdout(std::process::Stdio::piped())
       .stderr(std::process::Stdio::piped())
       .kill_on_drop(true);
    
    // Spawn the process
    println!("[spawn_amp_process] Attempting to spawn process...");
    let mut child = cmd.spawn()
        .map_err(|e| {
            let error_msg = format!("Failed to spawn process {}: {}", command, e);
            println!("[spawn_amp_process] ERROR: {}", error_msg);
            error_msg
        })?;
    println!("[spawn_amp_process] Process spawned successfully");
    
    // Get handles to stdin/stdout/stderr
    let _stdin = child.stdin.take()
        .ok_or("Failed to get stdin handle")?;
    let stdout = child.stdout.take()
        .ok_or("Failed to get stdout handle")?;
    let stderr = child.stderr.take()
        .ok_or("Failed to get stderr handle")?;
    
    // Store the process handle
    {
        let mut processes = process_manager.lock().unwrap();
        processes.insert(process_id.clone(), Arc::new(std::sync::Mutex::new(child)));
    }
    
    // Emit initial status
    let _ = app_handle.emit("process_status", serde_json::json!({
        "sessionId": session_id,
        "processId": process_id,
        "status": "spawning"
    }));
    
    // Spawn task to handle stdout
    let app_handle_stdout = app_handle.clone();
    let session_id_stdout = session_id.clone();
    let process_id_stdout = process_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => {
                    // EOF reached
                    break;
                }
                Ok(_) => {
                    // Emit output to frontend
                    let _ = app_handle_stdout.emit("process_output", serde_json::json!({
                        "sessionId": session_id_stdout,
                        "processId": process_id_stdout,
                        "data": line,
                        "stream": "stdout"
                    }));
                }
                Err(_) => {
                    // Error reading, process likely died
                    break;
                }
            }
        }
        
        // Notify that stdout stream ended
        let _ = app_handle_stdout.emit("process_status", serde_json::json!({
            "sessionId": session_id_stdout,
            "processId": process_id_stdout,
            "status": "dead"
        }));
    });
    
    // Spawn task to handle stderr
    let app_handle_stderr = app_handle.clone();
    let session_id_stderr = session_id.clone();
    let process_id_stderr = process_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let _ = app_handle_stderr.emit("process_output", serde_json::json!({
                        "sessionId": session_id_stderr,
                        "processId": process_id_stderr,
                        "data": line,
                        "stream": "stderr"
                    }));
                }
                Err(_) => break,
            }
        }
    });
    
    // Store stdin handle for later input
    // We'll need a separate map for stdin handles
    // For now, we'll use the process manager but this could be improved
    
    // Emit running status after successful spawn
    let _ = app_handle.emit("process_status", serde_json::json!({
        "sessionId": session_id,
        "processId": process_id,
        "status": "running"
    }));
    
    Ok(process_id)
}

#[tauri::command]
pub async fn spawn_process_raw(
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    env_clear: Option<bool>,
    session_id: String,
    app_handle: AppHandle,
    process_manager: State<'_, ProcessManager>,
) -> Result<String, String> {
    let process_id = Uuid::new_v4().to_string();

    println!("[spawn_process_raw] Command: {}", command);
    println!("[spawn_process_raw] Args: {:?}", args);
    println!("[spawn_process_raw] Env ({}): {:?}", env.len(),
        env.iter().map(|(k, v)| if k == "AMP_TOKEN" { format!("{}=[REDACTED:{}]", k, v.len()) } else { format!("{}={}", k, v) }).collect::<Vec<_>>()
    );

    let mut cmd = Command::new(&command);
    cmd.args(&args)
       .stdin(std::process::Stdio::piped())
       .stdout(std::process::Stdio::piped())
       .stderr(std::process::Stdio::piped())
       .kill_on_drop(true);

    if env_clear.unwrap_or(true) {
        cmd.env_clear();
    }
    cmd.envs(&env);

    println!("[spawn_process_raw] Attempting to spawn process...");
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn process {}: {}", command, e))?;
    println!("[spawn_process_raw] Process spawned successfully");

    let _stdin = child.stdin.take().ok_or("Failed to get stdin handle")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout handle")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr handle")?;

    {
        let mut processes = process_manager.lock().unwrap();
        processes.insert(process_id.clone(), Arc::new(std::sync::Mutex::new(child)));
    }

    let _ = app_handle.emit("process_status", serde_json::json!({
        "sessionId": session_id,
        "processId": process_id,
        "status": "spawning"
    }));

    let app_handle_stdout = app_handle.clone();
    let session_id_stdout = session_id.clone();
    let process_id_stdout = process_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let _ = app_handle_stdout.emit("process_output", serde_json::json!({
                        "sessionId": session_id_stdout,
                        "processId": process_id_stdout,
                        "data": line,
                        "stream": "stdout"
                    }));
                }
                Err(_) => break,
            }
        }
        let _ = app_handle_stdout.emit("process_status", serde_json::json!({
            "sessionId": session_id_stdout,
            "processId": process_id_stdout,
            "status": "dead"
        }));
    });

    let app_handle_stderr = app_handle.clone();
    let session_id_stderr = session_id.clone();
    let process_id_stderr = process_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let _ = app_handle_stderr.emit("process_output", serde_json::json!({
                        "sessionId": session_id_stderr,
                        "processId": process_id_stderr,
                        "data": line,
                        "stream": "stderr"
                    }));
                }
                Err(_) => break,
            }
        }
    });

    let _ = app_handle.emit("process_status", serde_json::json!({
        "sessionId": session_id,
        "processId": process_id,
        "status": "running"
    }));

    Ok(process_id)
}

#[tauri::command]
pub async fn kill_process(
    process_id: String,
    process_manager: State<'_, ProcessManager>,
) -> Result<(), String> {
    println!("Killing process: {}", process_id);
    
    let process_handle = {
        let mut processes = process_manager.lock().unwrap();
        processes.remove(&process_id)
    };
    
    if let Some(handle) = process_handle {
        // Take ownership of the child process and then kill it
        let mut child = Arc::try_unwrap(handle)
            .map_err(|_| "Could not take ownership of process".to_string())?
            .into_inner()
            .unwrap();
        
        match child.kill().await {
            Ok(_) => {
                println!("Successfully killed process: {}", process_id);
                Ok(())
            }
            Err(e) => {
                eprintln!("Failed to kill process {}: {}", process_id, e);
                Err(format!("Failed to kill process: {}", e))
            }
        }
    } else {
        Err(format!("Process {} not found", process_id))
    }
}

#[tauri::command]
pub async fn process_input(
    process_id: String,
    _data: String,
    process_manager: State<'_, ProcessManager>,
) -> Result<(), String> {
    let processes = process_manager.lock().unwrap();
    
    if let Some(_handle) = processes.get(&process_id) {
        // This is tricky - we need to store stdin handles separately
        // For now, return an error indicating this needs implementation
        Err("Process input not implemented yet - stdin handling needs separate storage".to_string())
    } else {
        Err(format!("Process {} not found", process_id))
    }
}

#[tauri::command]
pub async fn get_shell_env_var(var_name: String) -> Result<Option<String>, String> {
     // unchanged
    // First check if it's already in the current environment
    if let Ok(value) = env::var(&var_name) {
        if !value.contains("your-actual") && !value.contains("REDACTED") {
            return Ok(Some(value));
        }
    }
    
    println!("[get_shell_env_var] {} not found in env(), trying shell config files...", var_name);
    
    // Try to read from common shell config files
    let home = env::var("HOME").map_err(|_| "Could not get HOME directory")?;
    let shell_files = vec![
        format!("{}/.zprofile", home),  // macOS zsh users commonly put exports here
        format!("{}/.zshrc", home),
        format!("{}/.bashrc", home),
        format!("{}/.bash_profile", home),
        format!("{}/.profile", home),
    ];
    
    for file_path in shell_files {
        println!("[get_shell_env_var] Scanning {}", file_path);
        if let Ok(contents) = fs::read_to_string(&file_path) {
            // Look for export VAR_NAME=value patterns
            for line in contents.lines() {
                let line = line.trim();
                if line.starts_with(&format!("export {}=", var_name)) {
                    if let Some(eq_pos) = line.find('=') {
                        let value_part = &line[eq_pos + 1..];
                        // Remove quotes and handle different quote styles
                        let cleaned_value = value_part
                            .trim_matches('"')
                            .trim_matches('\'');
                        
                        if !cleaned_value.contains("your-actual") && 
                           !cleaned_value.contains("REDACTED") && 
                           !cleaned_value.is_empty() {
                            println!("[get_shell_env_var] Found {} in {}", var_name, file_path);
                            return Ok(Some(cleaned_value.to_string()));
                        }
                    }
                }
            }
        }
    }
    
    Ok(None)
}

// Toolbox Profile Management Commands

#[tauri::command]
pub async fn list_toolbox_profiles(
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<Vec<ToolboxProfile>, String> {
    if let Some(db) = profile_manager.db_pool.read().await.as_ref() {
        let store = ToolboxProfileStore::new(db.clone());
        store.list_profiles().await.map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn create_toolbox_profile(
    request: CreateToolboxProfileRequest,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<ToolboxProfile, String> {
    if let Some(db) = profile_manager.db_pool.read().await.as_ref() {
        let store = ToolboxProfileStore::new(db.clone());
        store.create_profile(request).await.map_err(|e| e.to_string())
    } else {
        Err("Database not available".to_string())
    }
}

#[tauri::command]
pub async fn update_toolbox_profile(
    request: UpdateToolboxProfileRequest,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<Option<ToolboxProfile>, String> {
    if let Some(db) = profile_manager.db_pool.read().await.as_ref() {
        let store = ToolboxProfileStore::new(db.clone());
        store.update_profile(request).await.map_err(|e| e.to_string())
    } else {
        Err("Database not available".to_string())
    }
}

#[tauri::command]
pub async fn delete_toolbox_profile(
    id: i64,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<bool, String> {
    if let Some(db) = profile_manager.db_pool.read().await.as_ref() {
        let store = ToolboxProfileStore::new(db.clone());
        store.delete_profile(id).await.map_err(|e| e.to_string())
    } else {
        Err("Database not available".to_string())
    }
}

#[tauri::command]
pub async fn set_active_toolbox_profile(
    profileId: Option<i64>,
    app_state: State<'_, crate::app_state::AppState>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<(), String> {
    if let Some(id) = profileId {
        // Get the profile and set its paths
        if let Some(db) = profile_manager.db_pool.read().await.as_ref() {
            let store = ToolboxProfileStore::new(db.clone());
            if let Some(profile) = store.get_profile(id).await.map_err(|e| e.to_string())? {
                let paths_str = profile.paths.join(if cfg!(windows) { ";" } else { ":" });
                {
                    let mut state = app_state.lock().unwrap();
                    state.set_env("AMP_TOOLBOX_PATHS".to_string(), paths_str.clone());
                    state.set_env("AMP_ACTIVE_TOOLBOX_PROFILE".to_string(), profile.name.clone());
                    // Always enable toolboxes when a profile is active
                    state.set_env("AMP_ENABLE_TOOLBOXES".to_string(), "1".to_string());
                    // Store active profile ID for persistence
                    state.active_toolbox_profile_id = Some(id);
                }
            } else {
                return Err("Profile not found".to_string());
            }
        } else {
            return Err("Database not available".to_string());
        }
    } else {
        // Clear active toolbox profile
        let mut state = app_state.lock().unwrap();
        state.amp_env.remove("AMP_TOOLBOX_PATHS");
        state.amp_env.remove("AMP_ACTIVE_TOOLBOX_PROFILE");
        state.amp_env.remove("AMP_ENABLE_TOOLBOXES");
        state.active_toolbox_profile_id = None;
    }
    
    let to_save = { let state = app_state.lock().unwrap(); state.clone() };
    to_save.save().await?;
    Ok(())
}

#[tauri::command]
pub async fn get_active_toolbox_profile(
    app_state: State<'_, crate::app_state::AppState>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<Option<ToolboxProfile>, String> {
    let profile_id = {
        let state = app_state.lock().unwrap();
        state.active_toolbox_profile_id
    };
    
    if let Some(id) = profile_id {
        if let Some(db) = profile_manager.db_pool.read().await.as_ref() {
            let store = ToolboxProfileStore::new(db.clone());
            store.get_profile(id).await.map_err(|e| e.to_string())
        } else {
            Ok(None)
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn migrate_toolbox_profiles(
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<(), String> {
    if let Some(db) = profile_manager.db_pool.read().await.as_ref() {
        let store = ToolboxProfileStore::new(db.clone());
        store.migrate_single_paths().await.map_err(|e| e.to_string())
    } else {
        Err("Database not available".to_string())
    }
}
