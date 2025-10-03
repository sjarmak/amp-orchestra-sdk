use std::sync::Arc;
use tauri::{AppHandle, State, Manager, Emitter};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use unified_core::domain::{Session, SessionStatus, AgentMode};

use crate::session_manager::{EnhancedSessionManager, SessionManagerConfig, SessionMetrics};
use crate::runtime_env::{RuntimeEnvironment, EnvKind};

#[cfg(feature = "worktree-manager")]
use crate::worktree_manager::TauriWorktreeManager;

/// State wrapper for the Enhanced Session Manager
pub type EnhancedSessionManagerState = Arc<RwLock<Option<EnhancedSessionManager>>>;

/// Request structure for creating a new session
#[derive(Debug, Deserialize)]
pub struct CreateEnhancedSessionRequest {
    pub name: String,
    pub prompt: String,
    pub repo_root: String,
    pub base_branch: Option<String>,
    pub agent_mode: Option<String>,
    pub enable_worktree: Option<bool>,
}

/// Response structure for session operations
#[derive(Debug, Serialize)]
pub struct SessionResponse {
    pub session: Session,
}

/// Response structure for session list
#[derive(Debug, Serialize)]
pub struct SessionListResponse {
    pub sessions: Vec<Session>,
}

/// Response structure for session status
#[derive(Debug, Serialize)]
pub struct SessionStatusResponse {
    pub session_id: String,
    pub status: SessionStatus,
}

/// Response structure for session metrics
#[derive(Debug, Serialize)]
pub struct SessionMetricsResponse {
    pub metrics: SessionMetrics,
}

/// Event payload for session status updates
#[derive(Debug, Clone, Serialize)]
pub struct SessionStatusEvent {
    pub session_id: String,
    pub status: SessionStatus,
    pub timestamp: String,
}

/// Event payload for session lifecycle events
#[derive(Debug, Clone, Serialize)]
pub struct SessionLifecycleEvent {
    pub session_id: String,
    pub event_type: String,
    pub message: String,
    pub timestamp: String,
}

/// Initialize the Enhanced Session Manager
pub async fn init_enhanced_session_manager(
    app_handle: &AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let runtime_env = RuntimeEnvironment::from_environment()
        .unwrap_or_else(|_| RuntimeEnvironment::new(EnvKind::LocalDevelopment));

    let config = SessionManagerConfig::default();
    let mut session_manager = EnhancedSessionManager::new(config, runtime_env);

    // Add worktree manager if the feature is enabled
    #[cfg(feature = "worktree-manager")]
    {
        if let Some(worktree_manager_state) = app_handle.try_state::<TauriWorktreeManager>() {
            session_manager = session_manager.with_worktree_manager(Arc::new(worktree_manager_state.inner().clone()));
        }
    }

    let enhanced_manager_state: EnhancedSessionManagerState = Arc::new(RwLock::new(Some(session_manager)));
    app_handle.manage(enhanced_manager_state);

    Ok(())
}

/// Create a new enhanced session
#[tauri::command]
pub async fn enhanced_session_create(
    request: CreateEnhancedSessionRequest,
    enhanced_manager_state: State<'_, EnhancedSessionManagerState>,
    app_handle: AppHandle,
) -> Result<SessionResponse, String> {
    let manager_guard = enhanced_manager_state.read().await;
    let manager = manager_guard.as_ref().ok_or("Session manager not initialized")?;

    let repo_root = std::path::PathBuf::from(&request.repo_root);
    let base_branch = request.base_branch.unwrap_or_else(|| "main".to_string());

    // Parse agent mode
    let agent_mode = request.agent_mode.as_deref().map(|mode| match mode {
        "geppetto" | "geppetto:main" => AgentMode::Geppetto,
        "claudetto" | "claudetto:main" => AgentMode::Claudetto,
        "gronk:fast" => AgentMode::GronkFast,
        "bolt" => AgentMode::Bolt,
        "default" => AgentMode::Default,
        custom => AgentMode::Custom(custom.to_string()),
    });

    let session = manager
        .create_session(
            request.name,
            request.prompt,
            repo_root,
            base_branch,
            agent_mode,
        )
        .await
        .map_err(|e| format!("Failed to create session: {}", e))?;

    // Emit session created event
    let _ = app_handle.emit("session-created", SessionLifecycleEvent {
        session_id: session.id.clone(),
        event_type: "created".to_string(),
        message: format!("Session '{}' created successfully", session.name),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    Ok(SessionResponse { session })
}

/// Start an enhanced session
#[tauri::command]
pub async fn enhanced_session_start(
    session_id: String,
    enhanced_manager_state: State<'_, EnhancedSessionManagerState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let manager_guard = enhanced_manager_state.read().await;
    let manager = manager_guard.as_ref().ok_or("Session manager not initialized")?;

    manager
        .start_session(&session_id)
        .await
        .map_err(|e| format!("Failed to start session: {}", e))?;

    // Emit session started event
    let _ = app_handle.emit("session-started", SessionLifecycleEvent {
        session_id: session_id.clone(),
        event_type: "started".to_string(),
        message: "Session started successfully".to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    // Emit status update
    let _ = app_handle.emit("session-status-update", SessionStatusEvent {
        session_id,
        status: SessionStatus::Running,
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    Ok(())
}

/// Stop an enhanced session
#[tauri::command]
pub async fn enhanced_session_stop(
    session_id: String,
    enhanced_manager_state: State<'_, EnhancedSessionManagerState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let manager_guard = enhanced_manager_state.read().await;
    let manager = manager_guard.as_ref().ok_or("Session manager not initialized")?;

    manager
        .stop_session(&session_id)
        .await
        .map_err(|e| format!("Failed to stop session: {}", e))?;

    // Emit session stopped event
    let _ = app_handle.emit("session-stopped", SessionLifecycleEvent {
        session_id: session_id.clone(),
        event_type: "stopped".to_string(),
        message: "Session stopped successfully".to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    // Emit status update
    let _ = app_handle.emit("session-status-update", SessionStatusEvent {
        session_id,
        status: SessionStatus::Completed,
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    Ok(())
}

/// List enhanced sessions
#[tauri::command]
pub async fn enhanced_session_list(
    status_filter: Option<String>,
    enhanced_manager_state: State<'_, EnhancedSessionManagerState>,
) -> Result<SessionListResponse, String> {
    let manager_guard = enhanced_manager_state.read().await;
    let manager = manager_guard.as_ref().ok_or("Session manager not initialized")?;

    // Parse status filter
    let status = status_filter.as_deref().map(|status_str| match status_str {
        "initializing" => SessionStatus::Initializing,
        "idle" => SessionStatus::Idle,
        "running" => SessionStatus::Running,
        "awaiting_input" => SessionStatus::AwaitingInput,
        "evaluating" => SessionStatus::Evaluating,
        "completed" => SessionStatus::Completed,
        error_msg => SessionStatus::Error(error_msg.to_string()),
    });

    let sessions = manager
        .list_sessions(status)
        .await
        .map_err(|e| format!("Failed to list sessions: {}", e))?;

    Ok(SessionListResponse { sessions })
}

/// Get enhanced session status
#[tauri::command]
pub async fn enhanced_session_status(
    session_id: String,
    enhanced_manager_state: State<'_, EnhancedSessionManagerState>,
) -> Result<SessionStatusResponse, String> {
    let manager_guard = enhanced_manager_state.read().await;
    let manager = manager_guard.as_ref().ok_or("Session manager not initialized")?;

    let status = manager
        .get_session_status(&session_id)
        .await
        .map_err(|e| format!("Failed to get session status: {}", e))?;

    Ok(SessionStatusResponse { session_id, status })
}

/// Get enhanced session metrics
#[tauri::command]
pub async fn enhanced_session_metrics(
    enhanced_manager_state: State<'_, EnhancedSessionManagerState>,
) -> Result<SessionMetricsResponse, String> {
    let manager_guard = enhanced_manager_state.read().await;
    let manager = manager_guard.as_ref().ok_or("Session manager not initialized")?;

    let metrics = manager.get_metrics().await;

    Ok(SessionMetricsResponse { metrics })
}
