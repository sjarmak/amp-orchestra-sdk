//! WorktreeManager - High-level worktree management with session integration
//! 
//! This module provides the WorktreeManager which wraps GitBackend implementations
//! to provide session-aware worktree management with proper error handling,
//! metrics collection, and database integration.

use std::path::PathBuf;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::domain::{SessionId, WorktreeInfo};
use crate::error::{GitError, PersistenceError};
use crate::git::{GitBackend, create_git_backend};
use crate::persistence::Store;

/// Specific error types for WorktreeManager operations
#[derive(thiserror::Error, Debug)]
pub enum WorktreeError {
    #[error("Session worktree already exists: {session_id}")]
    SessionWorktreeExists { session_id: SessionId },
    
    #[error("Session worktree not found: {session_id}")]
    SessionWorktreeNotFound { session_id: SessionId },
    
    #[error("Invalid session ID format: {session_id}")]
    InvalidSessionId { session_id: SessionId },
    
    #[error("Worktree directory creation failed: {path} - {reason}")]
    DirectoryCreationFailed { path: PathBuf, reason: String },
    
    #[error("Agent context initialization failed: {reason}")]
    AgentContextFailed { reason: String },
    
    #[error("Git operation failed: {0}")]
    Git(#[from] GitError),
    
    #[error("Persistence operation failed: {0}")]
    Persistence(#[from] PersistenceError),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub type WorktreeResult<T> = std::result::Result<T, WorktreeError>;

/// Configuration for WorktreeManager
#[derive(Debug, Clone)]
pub struct WorktreeManagerConfig {
    pub repo_root: PathBuf,
    pub worktrees_base_dir: PathBuf,
    pub agent_context_template_dir: Option<PathBuf>,
    pub auto_cleanup_orphans: bool,
    pub max_concurrent_operations: usize,
}

impl Default for WorktreeManagerConfig {
    fn default() -> Self {
        Self {
            repo_root: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            worktrees_base_dir: PathBuf::from(".worktrees"),
            agent_context_template_dir: None,
            auto_cleanup_orphans: true,
            max_concurrent_operations: 10,
        }
    }
}

/// Metrics for worktree operations
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorktreeMetrics {
    pub total_worktrees_created: u64,
    pub total_worktrees_cleaned: u64,
    pub total_orphans_cleaned: u64,
    pub average_creation_time_ms: f64,
    pub average_cleanup_time_ms: f64,
    pub active_worktrees_count: u64,
    pub errors_count: u64,
    pub last_operation_time: Option<DateTime<Utc>>,
}

/// WorktreeManager provides session-aware worktree management
/// 
/// This is the high-level API that session management should use,
/// built on top of the GitBackend implementations.
pub struct WorktreeManager {
    config: WorktreeManagerConfig,
    git_backend: Arc<Box<dyn GitBackend>>,
    store: Arc<dyn Store>,
    metrics: Arc<tokio::sync::RwLock<WorktreeMetrics>>,
    // Semaphore to limit concurrent operations
    operation_semaphore: Arc<tokio::sync::Semaphore>,
}

impl WorktreeManager {
    /// Create a new WorktreeManager instance
    pub async fn new(
        config: WorktreeManagerConfig,
        store: Arc<dyn Store>,
    ) -> WorktreeResult<Self> {
        let git_backend = Arc::new(create_git_backend(config.repo_root.clone())
            .map_err(WorktreeError::Git)?);
        
        // Initialize Git backend
        git_backend.initialize().await
            .map_err(WorktreeError::Git)?;
        
        let manager = Self {
            operation_semaphore: Arc::new(tokio::sync::Semaphore::new(config.max_concurrent_operations)),
            config,
            git_backend,
            store,
            metrics: Arc::new(tokio::sync::RwLock::new(WorktreeMetrics::default())),
        };
        
        // Auto-cleanup orphaned worktrees if enabled
        if manager.config.auto_cleanup_orphans {
            if let Err(e) = manager.cleanup_orphaned_worktrees().await {
                log::warn!("Failed to cleanup orphaned worktrees during initialization: {:?}", e);
            }
        }
        
        Ok(manager)
    }

    /// Create a session worktree with proper isolation
    /// 
    /// This method:
    /// 1. Validates the session doesn't already have a worktree
    /// 2. Generates unique branch name
    /// 3. Creates the worktree using GitBackend
    /// 4. Initializes AGENT_CONTEXT directory
    /// 5. Updates session record in database
    /// 6. Collects metrics
    pub async fn create_session_worktree(
        &self,
        session_id: &str,
        base_branch: &str,
    ) -> WorktreeResult<WorktreeInfo> {
        let _permit = self.operation_semaphore.acquire().await
            .map_err(|_| WorktreeError::AgentContextFailed {
                reason: "Failed to acquire operation permit".to_string(),
            })?;
        
        let start_time = std::time::Instant::now();
        
        // Validate session ID format
        if session_id.is_empty() || session_id.len() < 8 {
            return Err(WorktreeError::InvalidSessionId {
                session_id: session_id.to_string(),
            });
        }
        
        // Check if session already has a worktree
        if let Ok(existing_session) = self.store.get_session(&session_id.to_string()).await {
            if let Some(session) = existing_session {
                if session.worktree_path.exists() {
                    return Err(WorktreeError::SessionWorktreeExists {
                        session_id: session_id.to_string(),
                    });
                }
            }
        }
        
        // Generate unique branch name
        let branch_name = self.generate_branch_name(session_id);
        
        // Create worktree using GitBackend
        let mut worktree_info = self.git_backend
            .create_worktree(&session_id.to_string(), base_branch, &branch_name)
            .await
            .map_err(WorktreeError::Git)?;
        
        // Initialize AGENT_CONTEXT directory with templates if available
        self.initialize_agent_context(&worktree_info.worktree_path).await?;
        
        // Update session in store with the worktree path
        if let Ok(Some(mut session)) = self.store.get_session(&session_id.to_string()).await {
            session.worktree_path = worktree_info.worktree_path.clone();
            session.branch_name = worktree_info.branch_name.clone();
            let _ = self.store.update_session(&session).await; // Best effort
        }
        
        // Update metrics
        let creation_time_ms = start_time.elapsed().as_millis() as f64;
        self.update_creation_metrics(creation_time_ms).await;
        
        // Update worktree_info with final details
        worktree_info.created_at = Utc::now();
        worktree_info.is_active = true;
        
        log::info!(
            "Created worktree for session {} at path: {:?} ({}ms)",
            session_id, worktree_info.worktree_path, creation_time_ms as u64
        );
        
        Ok(worktree_info)
    }

    /// Clean up a session worktree safely
    /// 
    /// This method:
    /// 1. Validates the worktree exists
    /// 2. Performs Git cleanup (removes branch and worktree)
    /// 3. Updates session record
    /// 4. Collects metrics
    pub async fn cleanup_worktree(&self, session_id: &str) -> WorktreeResult<()> {
        let _permit = self.operation_semaphore.acquire().await
            .map_err(|_| WorktreeError::AgentContextFailed {
                reason: "Failed to acquire operation permit".to_string(),
            })?;
        
        let start_time = std::time::Instant::now();
        
        // Validate session exists
        let session = self.store.get_session(&session_id.to_string()).await
            .map_err(WorktreeError::Persistence)?
            .ok_or_else(|| WorktreeError::SessionWorktreeNotFound {
                session_id: session_id.to_string(),
            })?;
        
        // Check if worktree path exists
        if !session.worktree_path.exists() {
            log::warn!("Worktree path does not exist for session {}: {:?}", session_id, session.worktree_path);
        }
        
        // Cleanup using GitBackend
        self.git_backend.cleanup_worktree(&session_id.to_string()).await
            .map_err(WorktreeError::Git)?;
        
        // Update metrics
        let cleanup_time_ms = start_time.elapsed().as_millis() as f64;
        self.update_cleanup_metrics(cleanup_time_ms).await;
        
        log::info!(
            "Cleaned up worktree for session {} ({}ms)",
            session_id, cleanup_time_ms as u64
        );
        
        Ok(())
    }

    /// List all active worktrees
    /// 
    /// Returns worktrees that have corresponding session records
    pub async fn list_worktrees(&self) -> WorktreeResult<Vec<WorktreeInfo>> {
        let git_worktrees = self.git_backend.list_worktrees().await
            .map_err(WorktreeError::Git)?;
        
        let mut active_worktrees = Vec::new();
        
        // Filter worktrees that have corresponding sessions
        for worktree in git_worktrees {
            if let Ok(Some(_session)) = self.store.get_session(&worktree.session_id).await {
                active_worktrees.push(worktree);
            }
        }
        
        // Update active count metric
        self.update_active_count_metric(active_worktrees.len() as u64).await;
        
        Ok(active_worktrees)
    }

    /// Clean up orphaned worktrees that don't have corresponding sessions
    pub async fn cleanup_orphaned_worktrees(&self) -> WorktreeResult<Vec<String>> {
        let all_git_worktrees = self.git_backend.list_worktrees().await
            .map_err(WorktreeError::Git)?;
        
        let mut orphaned_sessions = Vec::new();
        
        for worktree in all_git_worktrees {
            // Check if session exists
            if let Ok(session_option) = self.store.get_session(&worktree.session_id).await {
                if session_option.is_none() {
                    // This is an orphaned worktree
                    log::info!("Cleaning up orphaned worktree for session: {}", worktree.session_id);
                    
                    if let Err(e) = self.git_backend.cleanup_worktree(&worktree.session_id).await {
                        log::error!("Failed to cleanup orphaned worktree {}: {:?}", worktree.session_id, e);
                        self.update_error_metrics().await;
                    } else {
                        orphaned_sessions.push(worktree.session_id.clone());
                    }
                }
            }
        }
        
        // Update orphan cleanup metrics
        self.update_orphan_cleanup_metrics(orphaned_sessions.len() as u64).await;
        
        if !orphaned_sessions.is_empty() {
            log::info!("Cleaned up {} orphaned worktrees", orphaned_sessions.len());
        }
        
        Ok(orphaned_sessions)
    }

    /// Get metrics for worktree operations
    pub async fn get_metrics(&self) -> WorktreeMetrics {
        self.metrics.read().await.clone()
    }

    /// Reset metrics (useful for testing)
    pub async fn reset_metrics(&self) -> WorktreeResult<()> {
        let mut metrics = self.metrics.write().await;
        *metrics = WorktreeMetrics::default();
        Ok(())
    }

    /// Generate a unique branch name for a session
    fn generate_branch_name(&self, session_id: &str) -> String {
        // Use first 8 characters of session ID for shorter branch names
        let session_prefix = if session_id.len() >= 8 {
            &session_id[..8]
        } else {
            session_id
        };
        format!("amp-session-{}", session_prefix)
    }

    /// Initialize AGENT_CONTEXT directory with optional templates
    async fn initialize_agent_context(&self, worktree_path: &PathBuf) -> WorktreeResult<()> {
        let agent_context_path = worktree_path.join("AGENT_CONTEXT");
        
        // Create directory
        tokio::fs::create_dir_all(&agent_context_path).await
            .map_err(|e| WorktreeError::DirectoryCreationFailed {
                path: agent_context_path.clone(),
                reason: e.to_string(),
            })?;

        // Copy template files if template directory is specified
        if let Some(template_dir) = &self.config.agent_context_template_dir {
            if template_dir.exists() {
                self.copy_template_files(template_dir, &agent_context_path).await?;
            }
        }

        // Create basic README if no templates
        let readme_path = agent_context_path.join("README.md");
        if !readme_path.exists() {
            let readme_content = format!(
                "# Agent Context\n\nThis directory contains context files for the Amp agent session.\n\nCreated: {}\n",
                Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
            );
            tokio::fs::write(readme_path, readme_content).await
                .map_err(|e| WorktreeError::AgentContextFailed {
                    reason: format!("Failed to write README.md: {}", e),
                })?;
        }

        Ok(())
    }

    /// Copy template files to AGENT_CONTEXT directory
    async fn copy_template_files(&self, template_dir: &PathBuf, target_dir: &PathBuf) -> WorktreeResult<()> {
        let mut entries = tokio::fs::read_dir(template_dir).await
            .map_err(|e| WorktreeError::AgentContextFailed {
                reason: format!("Failed to read template directory: {}", e),
            })?;

        while let Some(entry) = entries.next_entry().await
            .map_err(|e| WorktreeError::AgentContextFailed {
                reason: format!("Failed to iterate template directory: {}", e),
            })? {
            
            let source_path = entry.path();
            let file_name = entry.file_name();
            let target_path = target_dir.join(&file_name);

            if source_path.is_file() {
                tokio::fs::copy(&source_path, &target_path).await
                    .map_err(|e| WorktreeError::AgentContextFailed {
                        reason: format!("Failed to copy template file {:?}: {}", file_name, e),
                    })?;
            }
        }

        Ok(())
    }

    /// Update metrics for worktree creation
    async fn update_creation_metrics(&self, creation_time_ms: f64) {
        let mut metrics = self.metrics.write().await;
        metrics.total_worktrees_created += 1;
        metrics.last_operation_time = Some(Utc::now());
        
        // Update average creation time
        let total_ops = metrics.total_worktrees_created as f64;
        metrics.average_creation_time_ms = 
            (metrics.average_creation_time_ms * (total_ops - 1.0) + creation_time_ms) / total_ops;
    }

    /// Update metrics for worktree cleanup
    async fn update_cleanup_metrics(&self, cleanup_time_ms: f64) {
        let mut metrics = self.metrics.write().await;
        metrics.total_worktrees_cleaned += 1;
        metrics.last_operation_time = Some(Utc::now());
        
        // Update average cleanup time
        let total_ops = metrics.total_worktrees_cleaned as f64;
        metrics.average_cleanup_time_ms = 
            (metrics.average_cleanup_time_ms * (total_ops - 1.0) + cleanup_time_ms) / total_ops;
    }

    /// Update metrics for orphan cleanup
    async fn update_orphan_cleanup_metrics(&self, count: u64) {
        let mut metrics = self.metrics.write().await;
        metrics.total_orphans_cleaned += count;
        metrics.last_operation_time = Some(Utc::now());
    }

    /// Update active count metric
    async fn update_active_count_metric(&self, count: u64) {
        let mut metrics = self.metrics.write().await;
        metrics.active_worktrees_count = count;
    }

    /// Update error metrics
    async fn update_error_metrics(&self) {
        let mut metrics = self.metrics.write().await;
        metrics.errors_count += 1;
        metrics.last_operation_time = Some(Utc::now());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::InMemoryStore;
    use crate::domain::Session;
    use tempfile::TempDir;
    use std::process::Command;

    /// Create a test Git repository
    async fn create_test_repo() -> (TempDir, PathBuf) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_path_buf();
        
        // Initialize git repo
        let status = Command::new("git")
            .current_dir(&repo_path)
            .args(["init"])
            .status()
            .expect("Failed to run git init");
        assert!(status.success());

        // Configure git user
        Command::new("git")
            .current_dir(&repo_path)
            .args(["config", "user.name", "Test User"])
            .status()
            .expect("Failed to configure git user");
        
        Command::new("git")
            .current_dir(&repo_path)
            .args(["config", "user.email", "test@example.com"])
            .status()
            .expect("Failed to configure git email");

        // Create initial commit
        tokio::fs::write(repo_path.join("README.md"), "# Test Repository\n").await.unwrap();
        tokio::fs::write(repo_path.join(".gitignore"), "# Test gitignore\n").await.unwrap();
        
        Command::new("git")
            .current_dir(&repo_path)
            .args(["add", "README.md", ".gitignore"])
            .status()
            .expect("Failed to add file");
        
        Command::new("git")
            .current_dir(&repo_path)
            .args(["commit", "-m", "Initial commit"])
            .status()
            .expect("Failed to commit");

        // Create main branch (in case we're on 'master')
        Command::new("git")
            .current_dir(&repo_path)
            .args(["checkout", "-b", "main"])
            .status()
            .ok(); // Don't fail if branch already exists

        (temp_dir, repo_path)
    }

    /// Create a test WorktreeManager
    async fn create_test_manager() -> (TempDir, WorktreeManager) {
        let (temp_dir, repo_path) = create_test_repo().await;
        
        let config = WorktreeManagerConfig {
            repo_root: repo_path.clone(),
            worktrees_base_dir: temp_dir.path().join(".worktrees"),
            agent_context_template_dir: None,
            auto_cleanup_orphans: false, // Disable for controlled testing
            max_concurrent_operations: 5,
        };
        
        let store = Arc::new(InMemoryStore::new());
        let manager = WorktreeManager::new(config, store).await.unwrap();
        
        // Commit any changes made during initialization (like .gitignore updates)
        Command::new("git")
            .current_dir(&repo_path)
            .args(["add", ".gitignore"])
            .status()
            .ok(); // Ignore errors - might not have changed
        
        Command::new("git")
            .current_dir(&repo_path)
            .args(["commit", "-m", "Initialize worktree management", "--allow-empty"])
            .status()
            .ok(); // Ignore errors - might be empty
        
        (temp_dir, manager)
    }

    #[tokio::test]
    async fn test_worktree_manager_initialization() {
        let (_temp_dir, manager) = create_test_manager().await;
        
        // Manager should initialize successfully
        let metrics = manager.get_metrics().await;
        assert_eq!(metrics.total_worktrees_created, 0);
        assert_eq!(metrics.total_worktrees_cleaned, 0);
    }

    #[tokio::test]
    async fn test_create_session_worktree_success() {
        let (_temp_dir, manager) = create_test_manager().await;
        
        let session_id = "test-session-12345678";
        
        // Create session first
        let session = Session::new(
            "Test Session".to_string(),
            "Test prompt".to_string(),
            manager.config.repo_root.clone(),
            "main".to_string(),
        );
        let session = Session {
            id: session_id.to_string(),
            ..session
        };
        manager.store.create_session(&session).await.unwrap();
        
        // Create worktree
        let worktree_info = manager.create_session_worktree(session_id, "main").await.unwrap();
        
        assert_eq!(worktree_info.session_id, session_id);
        assert_eq!(worktree_info.base_branch, "main");
        assert!(worktree_info.worktree_path.exists());
        assert!(worktree_info.worktree_path.join("AGENT_CONTEXT").exists());
        assert!(worktree_info.worktree_path.join("AGENT_CONTEXT").join("README.md").exists());
        
        // Check metrics
        let metrics = manager.get_metrics().await;
        assert_eq!(metrics.total_worktrees_created, 1);
        assert!(metrics.average_creation_time_ms > 0.0);
    }

    #[tokio::test]
    async fn test_create_worktree_duplicate_session() {
        let (_temp_dir, manager) = create_test_manager().await;
        
        let session_id = "test-session-12345678";
        
        // Create session first
        let session = Session::new(
            "Test Session".to_string(),
            "Test prompt".to_string(),
            manager.config.repo_root.clone(),
            "main".to_string(),
        );
        let session = Session {
            id: session_id.to_string(),
            ..session
        };
        manager.store.create_session(&session).await.unwrap();
        
        // Create first worktree
        manager.create_session_worktree(session_id, "main").await.unwrap();
        
        // Attempt to create second worktree for same session should fail
        let result = manager.create_session_worktree(session_id, "main").await;
        assert!(matches!(result, Err(WorktreeError::SessionWorktreeExists { .. })));
    }

    #[tokio::test]
    async fn test_create_worktree_invalid_session_id() {
        let (_temp_dir, manager) = create_test_manager().await;
        
        let result = manager.create_session_worktree("short", "main").await;
        assert!(matches!(result, Err(WorktreeError::InvalidSessionId { .. })));
        
        let result = manager.create_session_worktree("", "main").await;
        assert!(matches!(result, Err(WorktreeError::InvalidSessionId { .. })));
    }

    #[tokio::test] 
    async fn test_cleanup_worktree_success() {
        let (_temp_dir, manager) = create_test_manager().await;
        
        let session_id = "test-session-12345678";
        
        // Create session first
        let session = Session::new(
            "Test Session".to_string(),
            "Test prompt".to_string(),
            manager.config.repo_root.clone(),
            "main".to_string(),
        );
        let session = Session {
            id: session_id.to_string(),
            ..session
        };
        manager.store.create_session(&session).await.unwrap();
        
        // Create worktree
        let worktree_info = manager.create_session_worktree(session_id, "main").await.unwrap();
        assert!(worktree_info.worktree_path.exists());
        
        // Cleanup worktree
        manager.cleanup_worktree(session_id).await.unwrap();
        
        // Verify cleanup
        assert!(!worktree_info.worktree_path.exists());
        
        // Check metrics
        let metrics = manager.get_metrics().await;
        assert_eq!(metrics.total_worktrees_cleaned, 1);
        assert!(metrics.average_cleanup_time_ms > 0.0);
    }

    #[tokio::test]
    async fn test_cleanup_nonexistent_worktree() {
        let (_temp_dir, manager) = create_test_manager().await;
        
        let result = manager.cleanup_worktree("nonexistent-session").await;
        assert!(matches!(result, Err(WorktreeError::SessionWorktreeNotFound { .. })));
    }

    #[tokio::test]
    async fn test_list_worktrees() {
        let (_temp_dir, manager) = create_test_manager().await;
        
        let session_ids = vec![
            "sess1111-11111111",
            "sess2222-22222222",
            "sess3333-33333333",
        ];
        
        // Create sessions and worktrees
        for session_id in &session_ids {
            let session = Session::new(
                format!("Test Session {}", session_id),
                "Test prompt".to_string(),
                manager.config.repo_root.clone(),
                "main".to_string(),
            );
            let session = Session {
                id: session_id.to_string(),
                ..session
            };
            manager.store.create_session(&session).await.unwrap();
            manager.create_session_worktree(session_id, "main").await.unwrap();
        }
        
        // List worktrees
        let worktrees = manager.list_worktrees().await.unwrap();
        assert_eq!(worktrees.len(), session_ids.len());
        
        // Verify all sessions are represented
        let found_sessions: std::collections::HashSet<_> = worktrees.iter()
            .map(|wt| wt.session_id.as_str())
            .collect();
        let expected_sessions: std::collections::HashSet<_> = session_ids.iter()
            .copied()
            .collect();
        assert_eq!(found_sessions, expected_sessions);
    }

    #[tokio::test]
    async fn test_cleanup_orphaned_worktrees() {
        let (_temp_dir, manager) = create_test_manager().await;
        
        let session_id = "test-session-12345678";
        
        // Create session and worktree
        let session = Session::new(
            "Test Session".to_string(),
            "Test prompt".to_string(),
            manager.config.repo_root.clone(),
            "main".to_string(),
        );
        let session = Session {
            id: session_id.to_string(),
            ..session
        };
        manager.store.create_session(&session).await.unwrap();
        let worktree_info = manager.create_session_worktree(session_id, "main").await.unwrap();
        
        // Delete session (making worktree orphaned)
        manager.store.delete_session(&session_id.to_string()).await.unwrap();
        
        // Cleanup orphaned worktrees
        let cleaned_sessions = manager.cleanup_orphaned_worktrees().await.unwrap();
        
        assert_eq!(cleaned_sessions.len(), 1);
        assert_eq!(cleaned_sessions[0], session_id);
        assert!(!worktree_info.worktree_path.exists());
        
        // Check metrics
        let metrics = manager.get_metrics().await;
        assert_eq!(metrics.total_orphans_cleaned, 1);
    }

    #[tokio::test]
    async fn test_concurrent_worktree_operations() {
        let (_temp_dir, manager) = create_test_manager().await;
        let manager = Arc::new(manager);
        
        let mut handles = vec![];
        
        // Create multiple worktrees concurrently
        for i in 0..5 {
            let manager = Arc::clone(&manager);
            let handle = tokio::spawn(async move {
                let session_id = format!("conc{:04}-session-{:04}", i, i);
                
                // Create session first
                let session = Session::new(
                    format!("Test Session {}", i),
                    "Test prompt".to_string(),
                    manager.config.repo_root.clone(),
                    "main".to_string(),
                );
                let session = Session {
                    id: session_id.clone(),
                    ..session
                };
                manager.store.create_session(&session).await.unwrap();
                
                // Create worktree
                manager.create_session_worktree(&session_id, "main").await
            });
            handles.push(handle);
        }
        
        // Wait for all operations to complete
        let results: Vec<_> = futures::future::join_all(handles).await;
        
        // All operations should succeed
        for result in results {
            assert!(result.unwrap().is_ok());
        }
        
        // Verify all worktrees were created
        let worktrees = manager.list_worktrees().await.unwrap();
        assert_eq!(worktrees.len(), 5);
        
        // Check metrics
        let metrics = manager.get_metrics().await;
        assert_eq!(metrics.total_worktrees_created, 5);
    }

    #[tokio::test]
    async fn test_metrics_reset() {
        let (_temp_dir, manager) = create_test_manager().await;
        
        let session_id = "test-session-12345678";
        
        // Create session first
        let session = Session::new(
            "Test Session".to_string(),
            "Test prompt".to_string(),
            manager.config.repo_root.clone(),
            "main".to_string(),
        );
        let session = Session {
            id: session_id.to_string(),
            ..session
        };
        manager.store.create_session(&session).await.unwrap();
        
        // Perform operations to generate metrics
        manager.create_session_worktree(session_id, "main").await.unwrap();
        manager.cleanup_worktree(session_id).await.unwrap();
        
        // Check metrics exist
        let metrics = manager.get_metrics().await;
        assert_eq!(metrics.total_worktrees_created, 1);
        assert_eq!(metrics.total_worktrees_cleaned, 1);
        
        // Reset metrics
        manager.reset_metrics().await.unwrap();
        
        // Verify metrics are reset
        let metrics = manager.get_metrics().await;
        assert_eq!(metrics.total_worktrees_created, 0);
        assert_eq!(metrics.total_worktrees_cleaned, 0);
        assert_eq!(metrics.average_creation_time_ms, 0.0);
        assert_eq!(metrics.average_cleanup_time_ms, 0.0);
    }

    /// Property-based test for worktree lifecycle invariants
    #[tokio::test]
    async fn test_worktree_lifecycle_invariants() {
        let (_temp_dir, manager) = create_test_manager().await;
        
        let session_ids = vec![
            "alpha111-1234567890ab",
            "beta2222-1234567890cd", 
            "gamma333-1234567890ef",
        ];
        
        // Property 1: Create -> List shows created worktrees
        for session_id in &session_ids {
            let session = Session::new(
                format!("Test Session {}", session_id),
                "Test prompt".to_string(),
                manager.config.repo_root.clone(),
                "main".to_string(),
            );
            let session = Session {
                id: session_id.to_string(),
                ..session
            };
            manager.store.create_session(&session).await.unwrap();
            manager.create_session_worktree(session_id, "main").await.unwrap();
        }
        
        let listed_worktrees = manager.list_worktrees().await.unwrap();
        assert_eq!(listed_worktrees.len(), session_ids.len());
        
        // Property 2: Cleanup -> List shows fewer worktrees
        manager.cleanup_worktree(&session_ids[1]).await.unwrap();
        let listed_worktrees = manager.list_worktrees().await.unwrap();
        assert_eq!(listed_worktrees.len(), session_ids.len() - 1);
        
        // Property 3: Cleanup remaining -> List is empty
        for session_id in &session_ids {
            // Only cleanup if not already cleaned
            if session_id != &session_ids[1] {
                manager.cleanup_worktree(session_id).await.unwrap();
            }
        }
        let listed_worktrees = manager.list_worktrees().await.unwrap();
        assert_eq!(listed_worktrees.len(), 0);
        
        // Property 4: Metrics consistency
        let metrics = manager.get_metrics().await;
        assert_eq!(metrics.total_worktrees_created, 3);
        assert_eq!(metrics.total_worktrees_cleaned, 3);
        assert!(metrics.total_worktrees_created >= metrics.total_worktrees_cleaned);
    }
}
