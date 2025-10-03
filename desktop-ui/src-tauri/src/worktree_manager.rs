//! Tauri integration for the WorktreeManager from unified-core
//! Provides WorktreeGuard and integration with session lifecycle.

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use unified_core::{WorktreeManager, WorktreeManagerConfig, WorktreeError, WorktreeInfo, WorktreeMetrics};
use unified_core::persistence::InMemoryStore;
use unified_core::SessionId;

/// Guard that ensures worktree cleanup when dropped
pub struct WorktreeGuard {
    session_id: SessionId,
    worktree_path: PathBuf,
    manager: Arc<RwLock<WorktreeManager>>,
}

impl WorktreeGuard {
    pub fn new(
        session_id: SessionId,
        worktree_path: PathBuf,
        manager: Arc<RwLock<WorktreeManager>>,
    ) -> Self {
        Self {
            session_id,
            worktree_path,
            manager,
        }
    }

    pub fn worktree_path(&self) -> &PathBuf {
        &self.worktree_path
    }

    pub fn session_id(&self) -> &SessionId {
        &self.session_id
    }
}

impl Drop for WorktreeGuard {
    fn drop(&mut self) {
        let session_id = self.session_id.clone();
        let manager = self.manager.clone();
        
        // Cleanup worktree in background task
        tokio::spawn(async move {
            let manager = manager.read().await;
            if let Err(e) = manager.cleanup_worktree(&session_id).await {
                log::error!("Failed to cleanup worktree for session {}: {}", session_id, e);
            } else {
                log::info!("Successfully cleaned up worktree for session {}", session_id);
            }
        });
    }
}

/// Configuration for worktree creation
#[derive(Debug, Clone)]
pub struct WorktreeConfig {
    pub repo_root: PathBuf,
    pub base_branch: String,
    pub branch_name_template: Option<String>,
}

impl Default for WorktreeConfig {
    fn default() -> Self {
        Self {
            repo_root: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            base_branch: "main".to_string(),
            branch_name_template: None,
        }
    }
}

/// Tauri-integrated worktree manager
#[derive(Clone)]
pub struct TauriWorktreeManager {
    manager: Arc<RwLock<WorktreeManager>>,
    config: WorktreeConfig,
}

impl TauriWorktreeManager {
    /// Create a new TauriWorktreeManager
    pub async fn new(config: WorktreeConfig) -> Result<Self, WorktreeError> {
        let wt_config = WorktreeManagerConfig {
            repo_root: config.repo_root.clone(),
            worktrees_base_dir: config.repo_root.join(".worktrees"),
            agent_context_template_dir: None,
            auto_cleanup_orphans: true,
            max_concurrent_operations: 10,
        };
        
        let store = Arc::new(InMemoryStore::default());
        let manager = WorktreeManager::new(wt_config, store).await?;
        
        let manager = Arc::new(RwLock::new(manager));
        
        Ok(Self {
            manager,
            config,
        })
    }

    /// Create a session with worktree isolation
    pub async fn create_session_worktree(
        &self,
        session_id: &SessionId,
        base_branch: Option<&str>,
    ) -> Result<WorktreeGuard, WorktreeError> {
        let base_branch = base_branch.unwrap_or(&self.config.base_branch);

        let manager = self.manager.read().await;
        let worktree_info = manager
            .create_session_worktree(session_id, base_branch)
            .await?;

        log::info!(
            "Created worktree for session {} at {}",
            session_id,
            worktree_info.worktree_path.display()
        );

        Ok(WorktreeGuard::new(
            session_id.clone(),
            worktree_info.worktree_path,
            self.manager.clone(),
        ))
    }

    /// List all active worktrees
    pub async fn list_worktrees(&self) -> Result<Vec<WorktreeInfo>, WorktreeError> {
        let manager = self.manager.read().await;
        manager.list_worktrees().await
    }

    /// Cleanup orphaned worktrees
    pub async fn cleanup_orphaned(&self) -> Result<Vec<SessionId>, WorktreeError> {
        let manager = self.manager.read().await;
        manager.cleanup_orphaned_worktrees().await
    }

    /// Get metrics
    pub async fn get_metrics(&self) -> WorktreeMetrics {
        let manager = self.manager.read().await;
        manager.get_metrics().await
    }
}

/// Initialize worktree manager from app state
pub async fn init_worktree_manager() -> Result<TauriWorktreeManager, WorktreeError> {
    // Default configuration - can be made configurable later
    let config = WorktreeConfig::default();
    TauriWorktreeManager::new(config).await
}
