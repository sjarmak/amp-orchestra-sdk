use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, State, Emitter};
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader, BufWriter, AsyncWriteExt};
use tokio::sync::mpsc;
use uuid::Uuid;
use sqlx::SqlitePool;

use crate::session_commands::{AmpSessionMap, AmpSession, choose_amp_command};
use crate::toolbox_profiles::ToolboxProfileStore;


/// Generate the worktree path for a given session ID
fn path_for(repo_path: &std::path::Path, session_id: &str) -> std::path::PathBuf {
    let short_sid = &session_id[..session_id.len().min(8)];
    repo_path.join(".amp-worktrees").join(short_sid)
}

/// Helper function to get session worktree path
/// Falls back to current directory if session worktree cannot be determined
async fn get_session_worktree_path(session_id: Option<&str>) -> std::path::PathBuf {
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionCreateRequest {
    pub profile_id: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ThreadStartRequest {
    pub session_id: String,
    pub context: String,  // "production" or "development"
    pub agent_mode: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ThreadAttachRequest {
    pub thread_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ThreadRefreshEnvRequest {
    pub thread_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub title: Option<String>,
    pub profile_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ThreadInfo {
    pub id: String,
    pub session_id: String,
    pub context: String,
    pub agent_mode: Option<String>,
    pub toolbox_snapshot: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

/// Creates a new session bound to a toolbox profile
#[tauri::command]
pub async fn new_session_create(
    request: SessionCreateRequest,
    _app_state: State<'_, crate::app_state::AppState>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<SessionInfo, String> {
    let session_id = Uuid::new_v4().to_string();
    
    // Get database connection
    let db = profile_manager.db_pool.read().await;
    let db = db.as_ref().ok_or("Database not available")?;

    // Validate profile exists if provided
    if let Some(profile_id) = request.profile_id {
        let store = ToolboxProfileStore::new(db.clone());
        let profile = store.get_profile(profile_id).await
            .map_err(|e| format!("Failed to get profile: {}", e))?;
        
        if profile.is_none() {
            return Err(format!("Profile {} not found", profile_id));
        }
    }

    // Insert session into database
    let result = sqlx::query_as::<_, (String, Option<String>, Option<i64>, String, String)>(
        "INSERT INTO sessions (id, title, profile_id) VALUES (?, ?, ?) 
         RETURNING id, title, profile_id, created_at, updated_at"
    )
    .bind(&session_id)
    .bind("New Session")
    .bind(request.profile_id)
    .fetch_one(db)
    .await
    .map_err(|e| format!("Failed to create session: {}", e))?;

    Ok(SessionInfo {
        id: result.0,
        title: result.1,
        profile_id: result.2,
        created_at: result.3,
        updated_at: result.4,
    })
}

/// Starts a new thread within a session with proper environment isolation
#[tauri::command]
pub async fn thread_start(
    request: ThreadStartRequest,
    app_handle: AppHandle,
    app_state: State<'_, crate::app_state::AppState>,
    amp_sessions: State<'_, AmpSessionMap>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<ThreadInfo, String> {
    let thread_id = Uuid::new_v4().to_string();
    
    // Get database connection
    let db = profile_manager.db_pool.read().await;
    let db = db.as_ref().ok_or("Database not available")?;

    // Verify session exists and get profile info
    let session = sqlx::query_as::<_, (String, Option<String>, Option<i64>)>(
        "SELECT id, title, profile_id FROM sessions WHERE id = ?"
    )
    .bind(&request.session_id)
    .fetch_optional(db)
    .await
    .map_err(|e| format!("Failed to get session: {}", e))?
    .ok_or_else(|| format!("Session {} not found", request.session_id))?;

    // Build environment with toolbox isolation
    let mut merged_env = build_thread_env(&app_state, session.2, &request.context, &request.agent_mode).await?;
    
    // Create toolbox snapshot for thread isolation
    let toolbox_snapshot = create_toolbox_snapshot(session.2, &profile_manager).await?;
    
    // Compose runtime environment (includes toolbox resolver)
    let compose = crate::runtime_env::compose_runtime_env(&mut merged_env)
        .map_err(|e| format!("Failed to compose runtime env: {}", e))?;

    // Insert thread into database
    let result = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, String, String, Option<String>)>(
        "INSERT INTO threads (id, session_id, context, agent_mode, toolbox_snapshot) 
         VALUES (?, ?, ?, ?, ?) 
         RETURNING id, session_id, context, agent_mode, toolbox_snapshot, created_at, updated_at, archived_at"
    )
    .bind(&thread_id)
    .bind(&request.session_id)
    .bind(&request.context)
    .bind(&request.agent_mode)
    .bind(&toolbox_snapshot)
    .fetch_one(db)
    .await
    .map_err(|e| format!("Failed to create thread: {}", e))?;

    // Start Amp process with isolated environment
    let (cmd, args) = choose_amp_command(&merged_env);
    
    // Get session worktree path for command execution
    let working_dir = get_session_worktree_path(Some(&request.session_id)).await;
    
    let mut child = Command::new(&cmd)
        .args(&args)
        .current_dir(working_dir)
        .env_clear()
        .envs(&merged_env)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn amp process: {}", e))?;

    let stdin = child.stdin.take().ok_or_else(|| "Failed to open stdin".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "Failed to open stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Failed to open stderr".to_string())?;

    // Create communication channel
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    
    // Spawn writer task
    tokio::spawn(async move {
        let mut writer = BufWriter::new(stdin);
        while let Some(line) = rx.recv().await {
            if writer.write_all(line.as_bytes()).await.is_err() { break; }
            if writer.write_all(b"\n").await.is_err() { break; }
            if writer.flush().await.is_err() { break; }
        }
    });

    // Create worktree if available
    #[cfg(feature = "worktree-manager")]
    let worktree_guard = {
        use crate::worktree_manager::TauriWorktreeManager;
        use tauri::Manager;
        
        if let Some(wt_manager) = app_handle.try_state::<TauriWorktreeManager>() {
            match wt_manager.create_session_worktree(&request.session_id, None).await {
                Ok(guard) => {
                    log::info!("Created worktree for thread {} at {}", thread_id, guard.worktree_path().display());
                    Some(guard)
                }
                Err(e) => {
                    log::error!("Failed to create worktree for thread {}: {}", thread_id, e);
                    None
                }
            }
        } else {
            None
        }
    };

    // Store session in AmpSessionMap
    {
        let mut map = amp_sessions.lock().await;
        map.insert(thread_id.clone(), AmpSession {
            child,
            tx,
            toolbox_guard: compose.guard,
            #[cfg(feature = "worktree-manager")]
            worktree_guard,
        });
    }

    // Start output handling tasks
    spawn_output_handlers(app_handle.clone(), thread_id.clone(), stdout, stderr, db.clone()).await;

    Ok(ThreadInfo {
        id: result.0,
        session_id: result.1,
        context: result.2,
        agent_mode: result.3,
        toolbox_snapshot: result.4,
        created_at: result.5,
        updated_at: result.6,
        archived_at: result.7,
    })
}

/// Attaches to an existing thread (with history if process died)
#[tauri::command]
pub async fn thread_attach(
    request: ThreadAttachRequest,
    app_handle: AppHandle,
    _app_state: State<'_, crate::app_state::AppState>,
    amp_sessions: State<'_, AmpSessionMap>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<ThreadInfo, String> {
    let db = profile_manager.db_pool.read().await;
    let db = db.as_ref().ok_or("Database not available")?;

    // Get thread info
    let thread = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, String, String, Option<String>)>(
        "SELECT id, session_id, context, agent_mode, toolbox_snapshot, created_at, updated_at, archived_at 
         FROM threads WHERE id = ? AND archived_at IS NULL"
    )
    .bind(&request.thread_id)
    .fetch_optional(db)
    .await
    .map_err(|e| format!("Failed to get thread: {}", e))?
    .ok_or_else(|| format!("Thread {} not found", request.thread_id))?;

    // Check if thread is already active
    {
        let map = amp_sessions.lock().await;
        if map.contains_key(&request.thread_id) {
            return Ok(ThreadInfo {
                id: thread.0,
                session_id: thread.1,
                context: thread.2,
                agent_mode: thread.3,
                toolbox_snapshot: thread.4,
                created_at: thread.5,
                updated_at: thread.6,
                archived_at: thread.7,
            });
        }
    }

    // Get session info for profile
    let session = sqlx::query_as::<_, (Option<i64>,)>(
        "SELECT profile_id FROM sessions WHERE id = ?"
    )
    .bind(&thread.1)
    .fetch_optional(db)
    .await
    .map_err(|e| format!("Failed to get session: {}", e))?
    .ok_or_else(|| format!("Session {} not found", thread.1))?;

    // Restore environment from thread snapshot
    let mut merged_env = restore_thread_env(&thread.4, session.0, &thread.2, &thread.3)?;
    
    // Re-compose runtime environment
    let compose = crate::runtime_env::compose_runtime_env(&mut merged_env)
        .map_err(|e| format!("Failed to compose runtime env: {}", e))?;

    // Restart Amp process
    let (cmd, args) = choose_amp_command(&merged_env);
    
    let mut child = Command::new(&cmd)
        .args(&args)
        .env_clear()
        .envs(&merged_env)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn amp process: {}", e))?;

    let stdin = child.stdin.take().ok_or_else(|| "Failed to open stdin".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "Failed to open stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Failed to open stderr".to_string())?;

    // Create communication channel
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    
    // Spawn writer task
    tokio::spawn(async move {
        let mut writer = BufWriter::new(stdin);
        while let Some(line) = rx.recv().await {
            if writer.write_all(line.as_bytes()).await.is_err() { break; }
            if writer.write_all(b"\n").await.is_err() { break; }
            if writer.flush().await.is_err() { break; }
        }
    });

    // Store session in AmpSessionMap
    {
        let mut map = amp_sessions.lock().await;
        map.insert(request.thread_id.clone(), AmpSession {
            child,
            tx,
            toolbox_guard: compose.guard,
            #[cfg(feature = "worktree-manager")]
            worktree_guard: None, // Could restore worktree if needed
        });
    }

    // Start output handling tasks
    spawn_output_handlers(app_handle.clone(), request.thread_id.clone(), stdout, stderr, db.clone()).await;

    // Send thread history to re-establish context
    send_thread_history(&request.thread_id, &amp_sessions, db).await?;

    Ok(ThreadInfo {
        id: thread.0,
        session_id: thread.1,
        context: thread.2,
        agent_mode: thread.3,
        toolbox_snapshot: thread.4,
        created_at: thread.5,
        updated_at: thread.6,
        archived_at: thread.7,
    })
}

/// Refreshes a thread's environment when toolbox profile changes
#[tauri::command]
pub async fn thread_refresh_env(
    request: ThreadRefreshEnvRequest,
    app_handle: AppHandle,
    _app_state: State<'_, crate::app_state::AppState>,
    amp_sessions: State<'_, AmpSessionMap>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<ThreadInfo, String> {
    let db = profile_manager.db_pool.read().await;
    let db = db.as_ref().ok_or("Database not available")?;

    // Get thread and session info
    let thread_session = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, String, String, Option<String>, Option<i64>)>(
        "SELECT t.id, t.session_id, t.context, t.agent_mode, t.toolbox_snapshot, 
                t.created_at, t.updated_at, t.archived_at, s.profile_id
         FROM threads t
         JOIN sessions s ON t.session_id = s.id
         WHERE t.id = ? AND t.archived_at IS NULL"
    )
    .bind(&request.thread_id)
    .fetch_optional(db)
    .await
    .map_err(|e| format!("Failed to get thread: {}", e))?
    .ok_or_else(|| format!("Thread {} not found", request.thread_id))?;

    // Create new toolbox snapshot
    let new_snapshot = create_toolbox_snapshot(thread_session.8, &profile_manager).await?;
    
    // Update thread with new snapshot
    sqlx::query("UPDATE threads SET toolbox_snapshot = ?, updated_at = (datetime('now', 'utc') || 'Z') WHERE id = ?")
        .bind(&new_snapshot)
        .bind(&request.thread_id)
        .execute(db)
        .await
        .map_err(|e| format!("Failed to update thread: {}", e))?;

    // If thread is active, restart it with new environment
    {
        let mut map = amp_sessions.lock().await;
        if let Some(session) = map.remove(&request.thread_id) {
            // Kill existing process
            drop(session);
            
            // Build new environment
            let mut merged_env = restore_thread_env(&Some(new_snapshot), thread_session.8, &thread_session.2, &thread_session.3)?;
            
            // Re-compose runtime environment
            let compose = crate::runtime_env::compose_runtime_env(&mut merged_env)
                .map_err(|e| format!("Failed to compose runtime env: {}", e))?;

            // Start new process
            let (cmd, args) = choose_amp_command(&merged_env);
            
            let mut child = Command::new(&cmd)
                .args(&args)
                .env_clear()
                .envs(&merged_env)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to spawn amp process: {}", e))?;

            let stdin = child.stdin.take().ok_or_else(|| "Failed to open stdin".to_string())?;
            let stdout = child.stdout.take().ok_or_else(|| "Failed to open stdout".to_string())?;
            let stderr = child.stderr.take().ok_or_else(|| "Failed to open stderr".to_string())?;

            // Create communication channel
            let (tx, mut rx) = mpsc::unbounded_channel::<String>();
            
            // Spawn writer task
            tokio::spawn(async move {
                let mut writer = BufWriter::new(stdin);
                while let Some(line) = rx.recv().await {
                    if writer.write_all(line.as_bytes()).await.is_err() { break; }
                    if writer.write_all(b"\n").await.is_err() { break; }
                    if writer.flush().await.is_err() { break; }
                }
            });

            // Store new session
            map.insert(request.thread_id.clone(), AmpSession {
                child,
                tx,
                toolbox_guard: compose.guard,
                #[cfg(feature = "worktree-manager")]
                worktree_guard: None, // Preserve existing worktree
            });

            // Start output handling
            spawn_output_handlers(app_handle.clone(), request.thread_id.clone(), stdout, stderr, db.clone()).await;
            
            // Send thread history to re-establish context
            send_thread_history(&request.thread_id, &amp_sessions, db).await?;
        }
    }

    // Return updated thread info
    let updated_thread = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, String, String, Option<String>)>(
        "SELECT id, session_id, context, agent_mode, toolbox_snapshot, created_at, updated_at, archived_at 
         FROM threads WHERE id = ?"
    )
    .bind(&request.thread_id)
    .fetch_one(db)
    .await
    .map_err(|e| format!("Failed to get updated thread: {}", e))?;

    Ok(ThreadInfo {
        id: updated_thread.0,
        session_id: updated_thread.1,
        context: updated_thread.2,
        agent_mode: updated_thread.3,
        toolbox_snapshot: updated_thread.4,
        created_at: updated_thread.5,
        updated_at: updated_thread.6,
        archived_at: updated_thread.7,
    })
}

// Helper functions

async fn build_thread_env(
    app_state: &State<'_, crate::app_state::AppState>,
    _profile_id: Option<i64>,
    context: &str,
    agent_mode: &Option<String>,
) -> Result<HashMap<String, String>, String> {
    let mut merged_env = {
        let state = app_state.lock().unwrap();
        state.compose_env()
    };

    merged_env.insert("AMP_DEBUG".to_string(), "true".to_string());

    // Set context-specific environment
    match context {
        "development" => {
            merged_env.insert("AMP_ENVIRONMENT".to_string(), "development".to_string());
        }
        "production" => {
            merged_env.insert("AMP_ENVIRONMENT".to_string(), "production".to_string());
        }
        _ => return Err(format!("Invalid context: {}", context)),
    }

    // Set agent mode if provided
    if let Some(mode) = agent_mode {
        merged_env.insert("AMP_EXPERIMENTAL_AGENT_MODE".to_string(), mode.clone());
    }

    Ok(merged_env)
}

async fn create_toolbox_snapshot(
    profile_id: Option<i64>,
    profile_manager: &State<'_, crate::profile_auth::ProfileManager>,
) -> Result<String, String> {
    if let Some(id) = profile_id {
        let db = profile_manager.db_pool.read().await;
        if let Some(db) = db.as_ref() {
            let store = ToolboxProfileStore::new(db.clone());
            if let Some(profile) = store.get_profile(id).await.map_err(|e| e.to_string())? {
                let snapshot = serde_json::json!({
                    "profile_id": id,
                    "name": profile.name,
                    "paths": profile.paths,
                    "timestamp": chrono::Utc::now().to_rfc3339()
                });
                return Ok(snapshot.to_string());
            }
        }
    }
    
    // Default empty snapshot
    let snapshot = serde_json::json!({
        "profile_id": null,
        "name": null,
        "paths": [],
        "timestamp": chrono::Utc::now().to_rfc3339()
    });
    Ok(snapshot.to_string())
}

fn restore_thread_env(
    snapshot: &Option<String>,
    _profile_id: Option<i64>,
    context: &str,
    agent_mode: &Option<String>,
) -> Result<HashMap<String, String>, String> {
    let mut env = HashMap::new();
    env.insert("AMP_DEBUG".to_string(), "true".to_string());

    // Restore from snapshot if available
    if let Some(snapshot_str) = snapshot {
        if let Ok(snapshot_data) = serde_json::from_str::<serde_json::Value>(snapshot_str) {
            if let Some(paths) = snapshot_data["paths"].as_array() {
                let paths_vec: Vec<String> = paths
                    .iter()
                    .filter_map(|p| p.as_str().map(|s| s.to_string()))
                    .collect();
                
                if !paths_vec.is_empty() {
                    let paths_str = paths_vec.join(if cfg!(windows) { ";" } else { ":" });
                    env.insert("AMP_TOOLBOX_PATHS".to_string(), paths_str);
                    env.insert("AMP_ENABLE_TOOLBOXES".to_string(), "1".to_string());
                }
            }
        }
    }

    // Set context-specific environment
    match context {
        "development" => {
            env.insert("AMP_ENVIRONMENT".to_string(), "development".to_string());
        }
        "production" => {
            env.insert("AMP_ENVIRONMENT".to_string(), "production".to_string());
        }
        _ => return Err(format!("Invalid context: {}", context)),
    }

    // Set agent mode if provided
    if let Some(mode) = agent_mode {
        env.insert("AMP_EXPERIMENTAL_AGENT_MODE".to_string(), mode.clone());
    }

    Ok(env)
}

async fn spawn_output_handlers(
    app_handle: AppHandle,
    thread_id: String,
    stdout: tokio::process::ChildStdout,
    stderr: tokio::process::ChildStderr,
    db: SqlitePool,
) {
    // Spawn stdout handler
    let app_handle_stdout = app_handle.clone();
    let thread_id_stdout = thread_id.clone();
    let db_stdout = db.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&line) {
                // Store message in database if it's a user or assistant message
                if let Some(msg_type) = parsed.get("type").and_then(|v| v.as_str()) {
                    match msg_type {
                        "user" | "assistant" => {
                            let message_id = Uuid::new_v4().to_string();
                            let content = serde_json::to_string(&parsed).unwrap_or_else(|_| line.clone());
                            
                            let _ = sqlx::query(
                                "INSERT INTO messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)"
                            )
                            .bind(&message_id)
                            .bind(&thread_id_stdout)
                            .bind(msg_type)
                            .bind(&content)
                            .execute(&db_stdout)
                            .await;
                        }
                        _ => {}
                    }
                }
                
                let _ = app_handle_stdout.emit("thread_stream", serde_json::json!({
                    "thread_id": thread_id_stdout,
                    "event": parsed,
                    "timestamp": chrono::Utc::now().timestamp_millis()
                }));
            } else {
                let _ = app_handle_stdout.emit("thread_stream", serde_json::json!({
                    "thread_id": thread_id_stdout,
                    "event": { "type": "error_output", "data": { "content": line } },
                    "timestamp": chrono::Utc::now().timestamp_millis()
                }));
            }
        }
        let _ = app_handle_stdout.emit("thread_stream", serde_json::json!({
            "thread_id": thread_id_stdout,
            "event": { "type": "result", "data": { "ended": true } },
            "timestamp": chrono::Utc::now().timestamp_millis()
        }));
    });

    // Spawn stderr handler
    let app_handle_stderr = app_handle.clone();
    let thread_id_stderr = thread_id.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_handle_stderr.emit("thread_stream", serde_json::json!({
                "thread_id": thread_id_stderr,
                "event": { "type": "error_output", "data": { "content": line } },
                "timestamp": chrono::Utc::now().timestamp_millis()
            }));
        }
    });
}

async fn send_thread_history(
    thread_id: &str,
    amp_sessions: &State<'_, AmpSessionMap>,
    db: &SqlitePool,
) -> Result<(), String> {
    // Get thread history from database
    let messages = sqlx::query_as::<_, (String, String, String)>(
        "SELECT role, content, created_at FROM messages 
         WHERE thread_id = ? ORDER BY created_at ASC"
    )
    .bind(thread_id)
    .fetch_all(db)
    .await
    .map_err(|e| format!("Failed to get thread history: {}", e))?;

    if messages.is_empty() {
        return Ok(());
    }

    // Send history to Amp process
    let map = amp_sessions.lock().await;
    if let Some(session) = map.get(thread_id) {
        for (_role, content, _created_at) in messages {
            if let Ok(parsed_content) = serde_json::from_str::<serde_json::Value>(&content) {
                let _ = session.tx.send(parsed_content.to_string());
            }
        }
    }

    Ok(())
}

// Additional helper commands for managing sessions and threads

/// List all sessions with optional profile filter
#[tauri::command]
pub async fn list_sessions(
    profile_id: Option<i64>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<Vec<SessionInfo>, String> {
    let db = profile_manager.db_pool.read().await;
    let db = db.as_ref().ok_or("Database not available")?;

    let sessions = if let Some(pid) = profile_id {
        sqlx::query_as::<_, (String, Option<String>, Option<i64>, String, String)>(
            "SELECT id, title, profile_id, created_at, updated_at FROM sessions WHERE profile_id = ? ORDER BY updated_at DESC"
        )
        .bind(pid)
        .fetch_all(db)
        .await
        .map_err(|e| format!("Failed to list sessions: {}", e))?
    } else {
        sqlx::query_as::<_, (String, Option<String>, Option<i64>, String, String)>(
            "SELECT id, title, profile_id, created_at, updated_at FROM sessions ORDER BY updated_at DESC"
        )
        .fetch_all(db)
        .await
        .map_err(|e| format!("Failed to list sessions: {}", e))?
    };

    let session_infos: Vec<SessionInfo> = sessions
        .into_iter()
        .map(|(id, title, profile_id, created_at, updated_at)| SessionInfo {
            id,
            title,
            profile_id,
            created_at,
            updated_at,
        })
        .collect();

    Ok(session_infos)
}

/// List all threads in a session
#[tauri::command]
pub async fn list_threads(
    session_id: String,
    include_archived: Option<bool>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<Vec<ThreadInfo>, String> {
    let db = profile_manager.db_pool.read().await;
    let db = db.as_ref().ok_or("Database not available")?;

    let threads = if include_archived.unwrap_or(false) {
        sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, String, String, Option<String>)>(
            "SELECT id, session_id, context, agent_mode, toolbox_snapshot, created_at, updated_at, archived_at 
             FROM threads WHERE session_id = ? ORDER BY created_at ASC"
        )
        .bind(&session_id)
        .fetch_all(db)
        .await
        .map_err(|e| format!("Failed to list threads: {}", e))?
    } else {
        sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, String, String, Option<String>)>(
            "SELECT id, session_id, context, agent_mode, toolbox_snapshot, created_at, updated_at, archived_at 
             FROM threads WHERE session_id = ? AND archived_at IS NULL ORDER BY created_at ASC"
        )
        .bind(&session_id)
        .fetch_all(db)
        .await
        .map_err(|e| format!("Failed to list threads: {}", e))?
    };

    let thread_infos: Vec<ThreadInfo> = threads
        .into_iter()
        .map(|(id, session_id, context, agent_mode, toolbox_snapshot, created_at, updated_at, archived_at)| ThreadInfo {
            id,
            session_id,
            context,
            agent_mode,
            toolbox_snapshot,
            created_at,
            updated_at,
            archived_at,
        })
        .collect();

    Ok(thread_infos)
}

/// Send a message to a thread
#[tauri::command]
pub async fn thread_send_message(
    thread_id: String,
    message: String,
    amp_sessions: State<'_, AmpSessionMap>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<(), String> {
    let map = amp_sessions.lock().await;
    let session = map.get(&thread_id).ok_or_else(|| format!("Thread {} not found or not active", thread_id))?;

    let payload = serde_json::json!({
        "type": "user",
        "message": {
            "role": "user",
            "content": [{ "type": "text", "text": message }]
        }
    });

    // Store message in database
    let db = profile_manager.db_pool.read().await;
    if let Some(db) = db.as_ref() {
        let message_id = Uuid::new_v4().to_string();
        let _ = sqlx::query(
            "INSERT INTO messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)"
        )
        .bind(&message_id)
        .bind(&thread_id)
        .bind("user")
        .bind(&payload.to_string())
        .execute(db)
        .await;
    }

    // Send via writer task
    session.tx.send(payload.to_string()).map_err(|e| e.to_string())?;

    Ok(())
}

/// Archive a thread (soft delete)
#[tauri::command]
pub async fn thread_archive(
    thread_id: String,
    amp_sessions: State<'_, AmpSessionMap>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<(), String> {
    let db = profile_manager.db_pool.read().await;
    let db = db.as_ref().ok_or("Database not available")?;

    // Archive thread in database
    sqlx::query("UPDATE threads SET archived_at = (datetime('now', 'utc') || 'Z') WHERE id = ?")
        .bind(&thread_id)
        .execute(db)
        .await
        .map_err(|e| format!("Failed to archive thread: {}", e))?;

    // Stop the process if it's running
    {
        let mut map = amp_sessions.lock().await;
        if let Some(session) = map.remove(&thread_id) {
            drop(session); // This will kill the process
        }
    }

    Ok(())
}

/// Get thread message history
#[tauri::command]
pub async fn get_thread_history(
    thread_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = profile_manager.db_pool.read().await;
    let db = db.as_ref().ok_or("Database not available")?;

    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);

    let messages = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id, role, content, created_at FROM messages 
         WHERE thread_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?"
    )
    .bind(&thread_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(db)
    .await
    .map_err(|e| format!("Failed to get thread history: {}", e))?;

    let history: Vec<serde_json::Value> = messages
        .into_iter()
        .map(|(id, role, content, created_at)| {
            serde_json::json!({
                "id": id,
                "role": role,
                "content": serde_json::from_str::<serde_json::Value>(&content).unwrap_or_else(|_| serde_json::Value::String(content)),
                "created_at": created_at
            })
        })
        .collect();

    Ok(history)
}
