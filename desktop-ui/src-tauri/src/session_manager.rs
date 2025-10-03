use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use anyhow::{Result, anyhow};
use tokio::sync::{RwLock, mpsc};
use chrono::Utc;

use unified_core::domain::{Session, SessionId, SessionStatus, AgentMode};
use unified_core::persistence::{Store, InMemoryStore};
use crate::toolbox_resolver::ToolboxGuard;
use crate::runtime_env::{RuntimeEnvironment, ComposeResult};

#[cfg(feature = "worktree-manager")]
use crate::worktree_manager::{TauriWorktreeManager, WorktreeGuard};

// Type alias for conditional compilation
#[cfg(feature = "worktree-manager")]
type OptionalWorktreeGuard = Option<WorktreeGuard>;
#[cfg(not(feature = "worktree-manager"))]
type OptionalWorktreeGuard = ();

/// Configuration for the Enhanced Session Manager
#[derive(Debug, Clone)]
pub struct SessionManagerConfig {
    pub enable_worktrees: bool,
    pub worktree_base_path: Option<PathBuf>,
    pub cleanup_on_shutdown: bool,
    pub max_concurrent_sessions: usize,
}

impl Default for SessionManagerConfig {
    fn default() -> Self {
        Self {
            enable_worktrees: cfg!(feature = "worktree-manager"),
            worktree_base_path: None,
            cleanup_on_shutdown: true,
            max_concurrent_sessions: 10,
        }
    }
}



/// Session metrics for monitoring and observability  
#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionMetrics {
    pub active_sessions: usize,
    pub total_sessions_created: u64,
    pub total_sessions_completed: u64,
    pub total_sessions_failed: u64,
    pub average_session_duration: Option<std::time::Duration>,
}

impl Default for SessionMetrics {
    fn default() -> Self {
        Self {
            active_sessions: 0,
            total_sessions_created: 0,
            total_sessions_completed: 0,
            total_sessions_failed: 0,
            average_session_duration: None,
        }
    }
}

/// Active session handle with process and resources
pub struct ActiveSession {
    pub session: Session,
    pub child: tokio::process::Child,
    pub tx: mpsc::UnboundedSender<String>,
    pub toolbox_guard: Option<ToolboxGuard>,
    #[cfg(feature = "worktree-manager")]
    pub worktree_guard: Option<WorktreeGuard>,
}

/// Enhanced Session Manager with full lifecycle management
pub struct EnhancedSessionManager {
    config: SessionManagerConfig,
    store: Arc<dyn Store>,
    #[cfg(feature = "worktree-manager")]
    worktree_manager: Option<Arc<TauriWorktreeManager>>,
    runtime_env: RuntimeEnvironment,
    metrics: Arc<RwLock<SessionMetrics>>,
    active_sessions: Arc<RwLock<HashMap<SessionId, ActiveSession>>>,
}

impl EnhancedSessionManager {
    /// Create a new Enhanced Session Manager
    pub fn new(
        config: SessionManagerConfig,
        runtime_env: RuntimeEnvironment,
    ) -> Self {
        let store = Arc::new(InMemoryStore::new());
        
        Self {
            config,
            store,
            #[cfg(feature = "worktree-manager")]
            worktree_manager: None,
            runtime_env,
            metrics: Arc::new(RwLock::new(SessionMetrics::default())),
            active_sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Set the worktree manager for session isolation
    #[cfg(feature = "worktree-manager")]
    pub fn with_worktree_manager(mut self, worktree_manager: Arc<TauriWorktreeManager>) -> Self {
        self.worktree_manager = Some(worktree_manager);
        self
    }

    /// Set the store implementation for session persistence
    pub fn with_store(mut self, store: Arc<dyn Store>) -> Self {
        self.store = store;
        self
    }

    /// Create a new session with optional worktree isolation
    pub async fn create_session(
        &self,
        name: String,
        prompt: String,
        repo_root: PathBuf,
        base_branch: String,
        agent_mode: Option<AgentMode>,
    ) -> Result<Session> {
        let mut session = Session::new(name, prompt, repo_root.clone(), base_branch);
        session.agent_mode = agent_mode;

        // Create worktree if enabled
        #[cfg(feature = "worktree-manager")]
        if self.config.enable_worktrees {
            if let Some(worktree_manager) = &self.worktree_manager {
                let worktree_guard = worktree_manager
                    .create_session_worktree(&session.id, Some(&session.base_branch))
                    .await
                    .map_err(|e| anyhow!("Failed to create worktree: {}", e))?;
                
                session.worktree_path = worktree_guard.worktree_path().clone();
            }
        }

        // Persist session
        self.store.create_session(&session).await
            .map_err(|e| anyhow!("Failed to persist session: {}", e))?;

        // Update metrics
        {
            let mut metrics = self.metrics.write().await;
            metrics.total_sessions_created += 1;
        }

        Ok(session)
    }

    /// Start a session by spawning the Amp CLI process
    pub async fn start_session(&self, session_id: &SessionId) -> Result<()> {
        let session = self.store.get_session(session_id).await
            .map_err(|e| anyhow!("Failed to get session: {}", e))?
            .ok_or_else(|| anyhow!("Session not found: {}", session_id))?;

        // Check if session is already active
        {
            let active_sessions = self.active_sessions.read().await;
            if active_sessions.contains_key(session_id) {
                return Err(anyhow!("Session already active: {}", session_id));
            }
        }

        // Compose runtime environment
        let compose_result = self.compose_environment(&session).await?;
        
        // Spawn Amp CLI process
        let (child, tx, toolbox_guard, worktree_guard) = self.spawn_amp_process(&session, compose_result).await?;

        // Create active session
        let active_session = ActiveSession {
            session: session.clone(),
            child,
            tx,
            toolbox_guard,
            #[cfg(feature = "worktree-manager")]
            worktree_guard,
        };

        // Add to active sessions
        {
            let mut active_sessions = self.active_sessions.write().await;
            active_sessions.insert(session_id.clone(), active_session);
        }

        // Update session status to running
        let mut running_session = session;
        running_session.status = SessionStatus::Running;
        running_session.last_run = Some(Utc::now());
        
        self.store.update_session(&running_session).await
            .map_err(|e| anyhow!("Failed to update session status: {}", e))?;

        // Update metrics
        {
            let mut metrics = self.metrics.write().await;
            metrics.active_sessions += 1;
        }

        Ok(())
    }

    /// Stop a running session and cleanup resources
    pub async fn stop_session(&self, session_id: &SessionId) -> Result<()> {
        let active_session = {
            let mut active_sessions = self.active_sessions.write().await;
            active_sessions.remove(session_id)
                .ok_or_else(|| anyhow!("Session not active: {}", session_id))?
        };

        // Kill the process
        let mut child = active_session.child;
        if let Err(e) = child.kill().await {
            eprintln!("Warning: Failed to kill process for session {}: {}", session_id, e);
        }

        // Update session status
        let mut session = active_session.session;
        session.status = SessionStatus::Completed;
        
        self.store.update_session(&session).await
            .map_err(|e| anyhow!("Failed to update session status: {}", e))?;

        // Update metrics
        {
            let mut metrics = self.metrics.write().await;
            metrics.active_sessions = metrics.active_sessions.saturating_sub(1);
            metrics.total_sessions_completed += 1;
        }

        Ok(())
    }

    /// List all sessions with optional status filter
    pub async fn list_sessions(&self, status_filter: Option<SessionStatus>) -> Result<Vec<Session>> {
        match status_filter {
            Some(status) => self.store.list_sessions_by_status(&status).await
                .map_err(|e| anyhow!("Failed to list sessions by status: {}", e)),
            None => self.store.list_sessions().await
                .map_err(|e| anyhow!("Failed to list sessions: {}", e)),
        }
    }

    /// Get session status including active/inactive state
    pub async fn get_session_status(&self, session_id: &SessionId) -> Result<SessionStatus> {
        let active_sessions = self.active_sessions.read().await;
        if active_sessions.contains_key(session_id) {
            return Ok(SessionStatus::Running);
        }

        let session = self.store.get_session(session_id).await
            .map_err(|e| anyhow!("Failed to get session: {}", e))?
            .ok_or_else(|| anyhow!("Session not found: {}", session_id))?;

        Ok(session.status)
    }

    /// Get current session metrics
    pub async fn get_metrics(&self) -> SessionMetrics {
        self.metrics.read().await.clone()
    }

    /// Compose the runtime environment for a session
    async fn compose_environment(&self, session: &Session) -> Result<ComposeResult> {
        let mut env = std::env::vars().collect::<HashMap<String, String>>();
        
        // Create a runtime environment configured for this session
        let mut runtime_env = self.runtime_env.clone();
        runtime_env.agent_mode = session.agent_mode.clone();
        runtime_env.worktree_path = Some(session.worktree_path.clone());

        // Use the enhanced compose_environment method
        runtime_env.compose_environment(&mut env, Some(&session.id))
    }

    /// Spawn the Amp CLI process with the given environment
    async fn spawn_amp_process(
        &self,
        session: &Session,
        compose_result: ComposeResult,
    ) -> Result<(tokio::process::Child, mpsc::UnboundedSender<String>, Option<ToolboxGuard>, OptionalWorktreeGuard)> {
        use tokio::process::Command;
        use std::process::Stdio;

        let cli_path = self.runtime_env.amp_config.cli_path
            .as_ref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "amp".to_string());

        let mut cmd = Command::new(&cli_path);
        cmd.arg("--agent-mode")
           .arg("geppetto:main") // Default for now
           .stdin(Stdio::piped())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());

        // Set working directory if we have a worktree
        if session.worktree_path.exists() {
            cmd.current_dir(&session.worktree_path);
        }

        // Apply environment variables - get from current environment with modifications
        let env = std::env::vars().collect::<HashMap<String, String>>();
        cmd.envs(&env);

        let child = cmd.spawn()
            .map_err(|e| anyhow!("Failed to spawn Amp CLI process: {}", e))?;

        // Create channel for communication
        let (tx, _rx) = mpsc::unbounded_channel();

        // Return toolbox guard from compose result
        #[cfg(feature = "worktree-manager")]
        let worktree_guard = None;
        #[cfg(not(feature = "worktree-manager"))]
        let worktree_guard = ();
        
        Ok((child, tx, compose_result.guard, worktree_guard))
    }
}
