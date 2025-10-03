use std::path::PathBuf;
use std::sync::Arc;
use async_trait::async_trait;
use tokio::sync::Mutex;
use crate::domain::{SessionId, WorktreeInfo};
use crate::error::{GitError, GitResult};

/// Context for Git operations - determines working directory
#[derive(Debug, Clone)]
pub enum GitContext {
    /// Repository-wide operations (clone, fetch, etc.)
    Repository,
    /// Session-specific operations (checkout, commit, status, etc.)
    Session(PathBuf),
}

/// Trait defining the five async Git backend operations
#[async_trait]
pub trait GitBackend: Send + Sync {
    /// Create a new worktree for a session
    /// 1. Validate base branch exists and is clean
    /// 2. Create isolated branch
    /// 3. Create worktree at .worktrees/{session_id}
    /// 4. Initialize AGENT_CONTEXT directory
    /// 5. Return worktree path
    async fn create_worktree(
        &self,
        session_id: &SessionId,
        base_branch: &str,
        branch_name: &str,
    ) -> GitResult<WorktreeInfo>;

    /// List all active worktrees
    /// Returns information about all existing worktrees
    async fn list_worktrees(&self) -> GitResult<Vec<WorktreeInfo>>;

    /// Clean up worktree and associated branch
    /// Safe cleanup with proper Git operations
    async fn cleanup_worktree(&self, session_id: &SessionId) -> GitResult<()>;

    /// Validate that the working directory is clean
    /// Check for uncommitted changes, untracked files, etc.
    async fn validate_clean(&self, path: &PathBuf) -> GitResult<bool>;

    /// Check if a branch exists in the repository
    async fn is_branch_existing(&self, branch_name: &str) -> GitResult<bool>;

    /// Initialize the backend (create directories, etc.)
    async fn initialize(&self) -> GitResult<()>;

    /// Run git command with specified context (repo-wide or session-specific)
    async fn run_git_command_in_context(&self, args: &[&str], context: GitContext) -> GitResult<String>;

    /// Check git command status with specified context
    async fn git_command_succeeds_in_context(&self, args: &[&str], context: GitContext) -> bool;
}

/// LibGit2Backend - Production backend using git2-rs with async compatibility
#[cfg(feature = "libgit2")]
pub struct LibGit2Backend {
    repo_root: PathBuf,
    worktrees_dir: PathBuf,
    /// File lock mutex to prevent concurrent Git operations
    _lock: Arc<Mutex<()>>,
}

#[cfg(feature = "libgit2")]
impl LibGit2Backend {
    pub fn new(repo_root: PathBuf) -> GitResult<Self> {
        let worktrees_dir = repo_root.join(".worktrees");
        
        // Verify this is a valid Git repository
        let _repo = git2::Repository::open(&repo_root)
            .map_err(|_e| GitError::RepositoryNotFound { 
                path: repo_root.clone() 
            })?;
        
        Ok(Self {
            repo_root,
            worktrees_dir,
            _lock: Arc::new(Mutex::new(())),
        })
    }

    /// Initialize the worktrees directory if it doesn't exist
    pub async fn initialize(&self) -> GitResult<()> {
        if !self.worktrees_dir.exists() {
            tokio::fs::create_dir_all(&self.worktrees_dir)
                .await
                .map_err(|e| GitError::OperationFailed {
                    operation: "create_worktrees_dir".to_string(),
                    reason: e.to_string(),
                })?;
        }

        // Create .gitignore entry for worktrees if needed
        let gitignore_path = self.repo_root.join(".gitignore");
        if gitignore_path.exists() {
            let content = tokio::fs::read_to_string(&gitignore_path).await.unwrap_or_default();
            if !content.contains(".worktrees/") {
                let mut updated_content = content;
                if !updated_content.ends_with('\n') {
                    updated_content.push('\n');
                }
                updated_content.push_str(".worktrees/\n");
                tokio::fs::write(&gitignore_path, updated_content)
                    .await
                    .map_err(|e| GitError::OperationFailed {
                        operation: "update_gitignore".to_string(),
                        reason: e.to_string(),
                    })?;
            }
        }

        Ok(())
    }

    /// Generate a unique branch name for the session
    fn generate_branch_name(session_id: &SessionId) -> String {
        format!("amp-session-{}", &session_id[..8])
    }

    /// Get the worktree path for a session
    fn get_worktree_path(&self, session_id: &SessionId) -> PathBuf {
        self.worktrees_dir.join(session_id)
    }

    /// Run git2 operations in a blocking context to avoid blocking async runtime
    async fn with_repo<F, R>(&self, f: F) -> GitResult<R>
    where
        F: FnOnce(&git2::Repository) -> Result<R, git2::Error> + Send + 'static,
        R: Send + 'static,
    {
        let repo_root = self.repo_root.clone();
        tokio::task::spawn_blocking(move || {
            let repo = git2::Repository::open(&repo_root)
                .map_err(|e| GitError::OperationFailed {
                    operation: "open_repository".to_string(),
                    reason: e.to_string(),
                })?;
            f(&repo).map_err(|e| GitError::OperationFailed {
                operation: "git_operation".to_string(),
                reason: e.to_string(),
            })
        })
        .await
        .map_err(|e| GitError::OperationFailed {
            operation: "spawn_blocking".to_string(),
            reason: e.to_string(),
        })?
    }
}

#[cfg(feature = "libgit2")]
#[async_trait]
impl GitBackend for LibGit2Backend {
    async fn create_worktree(
        &self,
        session_id: &SessionId,
        base_branch: &str,
        branch_name: &str,
    ) -> GitResult<WorktreeInfo> {
        let _guard = self._lock.lock().await;

        // 1. Validate base branch exists
        if !self.is_branch_existing(base_branch).await? {
            return Err(GitError::BranchNotFound {
                branch: base_branch.to_string(),
            });
        }

        // 2. Validate working directory is clean
        if !self.validate_clean(&self.repo_root).await? {
            return Err(GitError::DirtyWorkingDirectory {
                reason: "Repository has uncommitted changes".to_string(),
            });
        }

        // 3. Check if branch already exists
        if self.is_branch_existing(branch_name).await? {
            return Err(GitError::BranchExists {
                branch: branch_name.to_string(),
            });
        }

        let worktree_path = self.get_worktree_path(session_id);

        // 4. Check if worktree path already exists
        if worktree_path.exists() {
            return Err(GitError::WorktreeExists {
                path: worktree_path,
            });
        }

        // 5. Create branch and worktree using git2
        let base_branch_name = base_branch.to_string();
        let branch_name_clone = branch_name.to_string();
        
        self.with_repo(move |repo| {
            // Find the base branch reference
            let base_ref = repo.find_branch(&base_branch_name, git2::BranchType::Local)
                .or_else(|_| repo.find_branch(&base_branch_name, git2::BranchType::Remote))?;
            
            let base_commit = base_ref.get().peel_to_commit()?;
            
            // Create new branch from base branch
            repo.branch(&branch_name_clone, &base_commit, false)?;
            
            Ok(())
        }).await?;

        // 6. Create worktree directory (git2 doesn't have worktree support, so we use filesystem)
        tokio::fs::create_dir_all(&worktree_path)
            .await
            .map_err(|e| GitError::OperationFailed {
                operation: "create_worktree_dir".to_string(),
                reason: e.to_string(),
            })?;

        // 7. Create AGENT_CONTEXT directory
        let agent_context_dir = worktree_path.join("AGENT_CONTEXT");
        tokio::fs::create_dir_all(&agent_context_dir)
            .await
            .map_err(|e| GitError::OperationFailed {
                operation: "create_agent_context".to_string(),
                reason: e.to_string(),
            })?;

        // 8. Return worktree info
        Ok(WorktreeInfo {
            session_id: session_id.clone(),
            worktree_path,
            branch_name: branch_name.to_string(),
            base_branch: base_branch.to_string(),
            created_at: chrono::Utc::now(),
            is_active: true,
            commit_count: 0,
        })
    }

    async fn list_worktrees(&self) -> GitResult<Vec<WorktreeInfo>> {
        let mut worktrees = Vec::new();

        if !self.worktrees_dir.exists() {
            return Ok(worktrees);
        }

        let mut dir_entries = tokio::fs::read_dir(&self.worktrees_dir)
            .await
            .map_err(|e| GitError::OperationFailed {
                operation: "read_worktrees_dir".to_string(),
                reason: e.to_string(),
            })?;

        while let Some(entry) = dir_entries.next_entry().await.map_err(|e| {
            GitError::OperationFailed {
                operation: "iterate_worktrees_dir".to_string(),
                reason: e.to_string(),
            }
        })? {
            if entry.file_type().await.map_err(|e| {
                GitError::OperationFailed {
                    operation: "get_file_type".to_string(),
                    reason: e.to_string(),
                }
            })?.is_dir() {
                let session_id = entry.file_name().to_string_lossy().to_string();
                let worktree_path = entry.path();
                
                // Query Git for branch information
                let branch_name = Self::generate_branch_name(&session_id);
                let metadata = entry.metadata().await.map_err(|e| {
                    GitError::OperationFailed {
                        operation: "get_file_metadata".to_string(),
                        reason: e.to_string(),
                    }
                })?;
                
                let worktree_info = WorktreeInfo {
                    session_id: session_id.clone(),
                    worktree_path,
                    branch_name,
                    base_branch: "main".to_string(), // Could be determined from Git config
                    created_at: metadata.created().unwrap_or(std::time::UNIX_EPOCH).into(),
                    is_active: true,
                    commit_count: 0, // Could be determined from Git
                };
                
                worktrees.push(worktree_info);
            }
        }

        Ok(worktrees)
    }

    async fn cleanup_worktree(&self, session_id: &SessionId) -> GitResult<()> {
        let _guard = self._lock.lock().await;
        
        let worktree_path = self.get_worktree_path(session_id);
        let branch_name = Self::generate_branch_name(session_id);
        
        // 1. Delete branch first
        let branch_name_clone = branch_name.clone();
        self.with_repo(move |repo| {
            // Try to delete local branch
            if let Ok(mut branch) = repo.find_branch(&branch_name_clone, git2::BranchType::Local) {
                branch.delete()?;
            }
            Ok(())
        }).await.map_err(|e| {
            log::warn!("Failed to delete branch {}: {:?}", branch_name, e);
            e
        })?;

        // 2. Remove worktree directory
        if worktree_path.exists() {
            tokio::fs::remove_dir_all(&worktree_path)
                .await
                .map_err(|e| GitError::OperationFailed {
                    operation: "remove_worktree_dir".to_string(),
                    reason: e.to_string(),
                })?;
        }

        Ok(())
    }

    async fn validate_clean(&self, _path: &PathBuf) -> GitResult<bool> {
        if !self.repo_root.exists() {
            return Err(GitError::RepositoryNotFound {
                path: self.repo_root.clone(),
            });
        }

        self.with_repo(move |repo| {
            // Check for uncommitted changes
            let statuses = repo.statuses(None)?;
            
            // If there are any modified, added, deleted, or untracked files, repo is dirty
            for status in statuses.iter() {
                let flags = status.status();
                if flags.intersects(
                    git2::Status::INDEX_MODIFIED |
                    git2::Status::INDEX_NEW |
                    git2::Status::INDEX_DELETED |
                    git2::Status::WT_MODIFIED |
                    git2::Status::WT_NEW |
                    git2::Status::WT_DELETED
                ) {
                    return Ok(false);
                }
            }
            
            Ok(true)
        }).await
    }

    async fn is_branch_existing(&self, branch_name: &str) -> GitResult<bool> {
        let branch_name_clone = branch_name.to_string();
        self.with_repo(move |repo| {
            // Check local branches first
            if repo.find_branch(&branch_name_clone, git2::BranchType::Local).is_ok() {
                return Ok(true);
            }
            
            // Check remote branches
            if repo.find_branch(&branch_name_clone, git2::BranchType::Remote).is_ok() {
                return Ok(true);
            }
            
            Ok(false)
        }).await
    }

    async fn initialize(&self) -> GitResult<()> {
        if !self.worktrees_dir.exists() {
            tokio::fs::create_dir_all(&self.worktrees_dir)
                .await
                .map_err(|e| GitError::OperationFailed {
                    operation: "create_worktrees_dir".to_string(),
                    reason: e.to_string(),
                })?;
        }

        // Create .gitignore entry for worktrees if needed
        let gitignore_path = self.repo_root.join(".gitignore");
        if gitignore_path.exists() {
            let content = tokio::fs::read_to_string(&gitignore_path).await.unwrap_or_default();
            if !content.contains(".worktrees/") {
                let mut updated_content = content;
                if !updated_content.ends_with('\n') {
                    updated_content.push('\n');
                }
                updated_content.push_str(".worktrees/\n");
                tokio::fs::write(&gitignore_path, updated_content)
                    .await
                    .map_err(|e| GitError::OperationFailed {
                        operation: "update_gitignore".to_string(),
                        reason: e.to_string(),
                    })?;
            }
        }

        Ok(())
    }

    async fn run_git_command_in_context(&self, args: &[&str], context: GitContext) -> GitResult<String> {
        // LibGit2Backend uses git2 library, not CLI commands
        // This method is primarily for the CliBackend
        Err(GitError::OperationFailed {
            operation: "run_git_command_in_context".to_string(),
            reason: "LibGit2Backend does not support CLI commands".to_string(),
        })
    }

    async fn git_command_succeeds_in_context(&self, _args: &[&str], _context: GitContext) -> bool {
        // LibGit2Backend uses git2 library, not CLI commands
        false
    }
}

/// CliBackend - Fallback backend using CLI git commands
pub struct CliBackend {
    repo_root: PathBuf,
    worktrees_dir: PathBuf,
    /// File lock mutex to prevent concurrent Git operations
    _lock: Arc<Mutex<()>>,
}

impl CliBackend {
    pub fn new(repo_root: PathBuf) -> GitResult<Self> {
        let worktrees_dir = repo_root.join(".worktrees");
        
        // Verify this is a valid Git repository
        if !repo_root.join(".git").exists() {
            return Err(GitError::RepositoryNotFound { 
                path: repo_root.clone() 
            });
        }
        
        Ok(Self {
            repo_root,
            worktrees_dir,
            _lock: Arc::new(Mutex::new(())),
        })
    }

    /// Initialize the worktrees directory if it doesn't exist
    pub async fn initialize(&self) -> GitResult<()> {
        if !self.worktrees_dir.exists() {
            tokio::fs::create_dir_all(&self.worktrees_dir)
                .await
                .map_err(|e| GitError::OperationFailed {
                    operation: "create_worktrees_dir".to_string(),
                    reason: e.to_string(),
                })?;
        }

        // Create .gitignore entry for worktrees if needed
        let gitignore_path = self.repo_root.join(".gitignore");
        if gitignore_path.exists() {
            let content = tokio::fs::read_to_string(&gitignore_path).await.unwrap_or_default();
            if !content.contains(".worktrees/") {
                let mut updated_content = content;
                if !updated_content.ends_with('\n') {
                    updated_content.push('\n');
                }
                updated_content.push_str(".worktrees/\n");
                tokio::fs::write(&gitignore_path, updated_content)
                    .await
                    .map_err(|e| GitError::OperationFailed {
                        operation: "update_gitignore".to_string(),
                        reason: e.to_string(),
                    })?;
            }
        }

        Ok(())
    }

    /// Generate a unique branch name for the session
    fn generate_branch_name(session_id: &SessionId) -> String {
        format!("amp-session-{}", &session_id[..8])
    }

    /// Get the worktree path for a session
    fn get_worktree_path(&self, session_id: &SessionId) -> PathBuf {
        self.worktrees_dir.join(session_id)
    }

    /// Run a git command and return the output (defaults to repository context)
    async fn run_git_command(&self, args: &[&str]) -> GitResult<String> {
        self.run_git_command_in_context(args, GitContext::Repository).await
    }

    /// Check if git command succeeded (for boolean operations, defaults to repository context)
    async fn git_command_succeeds(&self, args: &[&str]) -> bool {
        self.git_command_succeeds_in_context(args, GitContext::Repository).await
    }

    /// Run a git command with specified context and return the output
    async fn run_git_command_in_context(&self, args: &[&str], context: GitContext) -> GitResult<String> {
        let working_dir = match context {
            GitContext::Repository => &self.repo_root,
            GitContext::Session(ref path) => path,
        };

        let mut cmd = tokio::process::Command::new("git");
        cmd.current_dir(working_dir);
        cmd.args(args);
        
        let output = cmd.output().await
            .map_err(|e| GitError::OperationFailed {
                operation: format!("git {}", args.join(" ")),
                reason: format!("Failed to execute git command: {}", e),
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GitError::OperationFailed {
                operation: format!("git {}", args.join(" ")),
                reason: format!("Git command failed: {}", stderr),
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.trim().to_string())
    }

    /// Check if git command succeeded with specified context (for boolean operations)
    async fn git_command_succeeds_in_context(&self, args: &[&str], context: GitContext) -> bool {
        let working_dir = match context {
            GitContext::Repository => &self.repo_root,
            GitContext::Session(ref path) => path,
        };

        let mut cmd = tokio::process::Command::new("git");
        cmd.current_dir(working_dir);
        cmd.args(args);
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::null());
        
        if let Ok(status) = cmd.status().await {
            status.success()
        } else {
            false
        }
    }
}

#[async_trait]
impl GitBackend for CliBackend {
    async fn create_worktree(
        &self,
        session_id: &SessionId,
        base_branch: &str,
        branch_name: &str,
    ) -> GitResult<WorktreeInfo> {
        let _guard = self._lock.lock().await;

        // 1. Validate base branch exists
        if !self.is_branch_existing(base_branch).await? {
            return Err(GitError::BranchNotFound {
                branch: base_branch.to_string(),
            });
        }

        // 2. Validate working directory is clean
        if !self.validate_clean(&self.repo_root).await? {
            return Err(GitError::DirtyWorkingDirectory {
                reason: "Repository has uncommitted changes".to_string(),
            });
        }

        // 3. Check if branch already exists
        if self.is_branch_existing(branch_name).await? {
            return Err(GitError::BranchExists {
                branch: branch_name.to_string(),
            });
        }

        let worktree_path = self.get_worktree_path(session_id);

        // 4. Check if worktree path already exists
        if worktree_path.exists() {
            return Err(GitError::WorktreeExists {
                path: worktree_path,
            });
        }

        // 5. Create worktree using git commands
        let worktree_path_str = worktree_path.to_string_lossy();
        
        // Create worktree: git worktree add -b <branch> <path> <base_branch>
        self.run_git_command(&[
            "worktree", "add", "-b", branch_name, 
            &worktree_path_str, base_branch
        ]).await?;

        // 6. Create AGENT_CONTEXT directory
        let agent_context_dir = worktree_path.join("AGENT_CONTEXT");
        tokio::fs::create_dir_all(&agent_context_dir)
            .await
            .map_err(|e| GitError::OperationFailed {
                operation: "create_agent_context".to_string(),
                reason: e.to_string(),
            })?;

        // 7. Return worktree info
        Ok(WorktreeInfo {
            session_id: session_id.clone(),
            worktree_path,
            branch_name: branch_name.to_string(),
            base_branch: base_branch.to_string(),
            created_at: chrono::Utc::now(),
            is_active: true,
            commit_count: 0,
        })
    }

    async fn list_worktrees(&self) -> GitResult<Vec<WorktreeInfo>> {
        // Use git worktree list --porcelain to get worktree information
        let output = self.run_git_command(&["worktree", "list", "--porcelain"])
            .await
            .unwrap_or_default();

        let mut worktrees = Vec::new();
        let mut current_worktree: Option<String> = None;
        let mut current_branch: Option<String> = None;

        for line in output.lines() {
            if line.starts_with("worktree ") {
                if let (Some(path), Some(branch)) = (current_worktree.take(), current_branch.take()) {
                    if let Some(session_id) = self.extract_session_id(&path) {
                        worktrees.push(WorktreeInfo {
                            session_id: session_id.clone(),
                            worktree_path: PathBuf::from(path),
                            branch_name: branch,
                            base_branch: "main".to_string(), // Could be determined more accurately
                            created_at: chrono::Utc::now(), // Could be read from filesystem
                            is_active: true,
                            commit_count: 0, // Could be determined from Git
                        });
                    }
                }
                current_worktree = Some(line[9..].to_string()); // Skip "worktree "
            } else if line.starts_with("branch ") {
                current_branch = Some(line[7..].to_string()); // Skip "branch "
            }
        }

        // Handle the last worktree
        if let (Some(path), Some(branch)) = (current_worktree, current_branch) {
            if let Some(session_id) = self.extract_session_id(&path) {
                worktrees.push(WorktreeInfo {
                    session_id: session_id.clone(),
                    worktree_path: PathBuf::from(path),
                    branch_name: branch,
                    base_branch: "main".to_string(),
                    created_at: chrono::Utc::now(),
                    is_active: true,
                    commit_count: 0,
                });
            }
        }

        Ok(worktrees)
    }

    async fn cleanup_worktree(&self, session_id: &SessionId) -> GitResult<()> {
        let _guard = self._lock.lock().await;
        
        let worktree_path = self.get_worktree_path(session_id);
        
        if !worktree_path.exists() {
            return Err(GitError::WorktreeNotFound {
                path: worktree_path,
            });
        }

        // 1. Remove worktree: git worktree remove <path>
        let worktree_path_str = worktree_path.to_string_lossy();
        self.run_git_command(&["worktree", "remove", "--force", &worktree_path_str])
            .await?;

        // 2. Delete branch: git branch -D <branch>
        let branch_name = Self::generate_branch_name(session_id);
        self.run_git_command(&["branch", "-D", &branch_name])
            .await
            .map_err(|e| {
                log::warn!("Failed to delete branch {}: {:?}", branch_name, e);
                e
            })?;

        Ok(())
    }

    async fn validate_clean(&self, path: &PathBuf) -> GitResult<bool> {
        if !path.exists() {
            return Err(GitError::RepositoryNotFound {
                path: path.clone(),
            });
        }

        // Check if there are any uncommitted changes: git status --porcelain
        let output = self.run_git_command(&["status", "--porcelain"])
            .await?;
        
        // If output is empty, the repository is clean
        Ok(output.trim().is_empty())
    }

    async fn is_branch_existing(&self, branch_name: &str) -> GitResult<bool> {
        // Check if branch exists: git show-ref --verify --quiet refs/heads/<branch>
        let local_ref = format!("refs/heads/{}", branch_name);
        if self.git_command_succeeds(&["show-ref", "--verify", "--quiet", &local_ref]).await {
            return Ok(true);
        }
        
        // Check remote branches: git show-ref --verify --quiet refs/remotes/origin/<branch>
        let remote_ref = format!("refs/remotes/origin/{}", branch_name);
        Ok(self.git_command_succeeds(&["show-ref", "--verify", "--quiet", &remote_ref]).await)
    }

    async fn initialize(&self) -> GitResult<()> {
        if !self.worktrees_dir.exists() {
            tokio::fs::create_dir_all(&self.worktrees_dir)
                .await
                .map_err(|e| GitError::OperationFailed {
                    operation: "create_worktrees_dir".to_string(),
                    reason: e.to_string(),
                })?;
        }

        // Create .gitignore entry for worktrees if needed
        let gitignore_path = self.repo_root.join(".gitignore");
        if gitignore_path.exists() {
            let content = tokio::fs::read_to_string(&gitignore_path).await.unwrap_or_default();
            if !content.contains(".worktrees/") {
                let mut updated_content = content;
                if !updated_content.ends_with('\n') {
                    updated_content.push('\n');
                }
                updated_content.push_str(".worktrees/\n");
                tokio::fs::write(&gitignore_path, updated_content)
                    .await
                    .map_err(|e| GitError::OperationFailed {
                        operation: "update_gitignore".to_string(),
                        reason: e.to_string(),
                    })?;
            }
        }

        Ok(())
    }

    async fn run_git_command_in_context(&self, args: &[&str], context: GitContext) -> GitResult<String> {
        // Just delegate to the instance method we defined above
        self.run_git_command_in_context(args, context).await
    }

    async fn git_command_succeeds_in_context(&self, args: &[&str], context: GitContext) -> bool {
        // Just delegate to the instance method we defined above
        self.git_command_succeeds_in_context(args, context).await
    }
}

impl CliBackend {
    /// Extract session ID from worktree path if it's in our .worktrees directory
    fn extract_session_id(&self, path: &str) -> Option<String> {
        let path_buf = PathBuf::from(path);
        if let Ok(relative) = path_buf.strip_prefix(&self.worktrees_dir) {
            if let Some(session_id) = relative.components().next() {
                return Some(session_id.as_os_str().to_string_lossy().to_string());
            }
        }
        None
    }
}

/// Factory function to create the appropriate Git backend
pub fn create_git_backend(repo_root: PathBuf) -> GitResult<Box<dyn GitBackend>> {
    // Try LibGit2Backend first (if feature is enabled)
    #[cfg(feature = "libgit2")]
    {
        match LibGit2Backend::new(repo_root.clone()) {
            Ok(backend) => {
                log::info!("Using LibGit2Backend for Git operations");
                return Ok(Box::new(backend));
            }
            Err(e) => {
                log::warn!("LibGit2Backend failed to initialize: {:?}, falling back to CLI", e);
            }
        }
    }
    
    // Fallback to CliBackend
    let backend = CliBackend::new(repo_root)?;
    log::info!("Using CliBackend for Git operations");
    Ok(Box::new(backend))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::process::Command;

    /// Create a test Git repository
    async fn create_test_repo(temp_dir: &TempDir) -> GitResult<PathBuf> {
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
        tokio::fs::write(repo_path.join("README.md"), "# Test Repository\n").await?;
        
        Command::new("git")
            .current_dir(&repo_path)
            .args(["add", "README.md"])
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

        Ok(repo_path)
    }

    #[tokio::test]
    async fn test_cli_backend_initialization() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = create_test_repo(&temp_dir).await.unwrap();
        
        let backend = CliBackend::new(repo_path).unwrap();
        backend.initialize().await.unwrap();
        
        assert!(backend.worktrees_dir.exists());
    }

    #[tokio::test]
    async fn test_cli_backend_branch_operations() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = create_test_repo(&temp_dir).await.unwrap();
        
        let backend = CliBackend::new(repo_path).unwrap();
        
        // Test existing branches
        assert!(backend.is_branch_existing("main").await.unwrap());
        assert!(!backend.is_branch_existing("nonexistent-branch").await.unwrap());
    }

    #[tokio::test]
    async fn test_cli_backend_validate_clean() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = create_test_repo(&temp_dir).await.unwrap();
        
        let backend = CliBackend::new(repo_path.clone()).unwrap();
        
        // Repository should be clean initially
        assert!(backend.validate_clean(&repo_path).await.unwrap());
        
        // Add an untracked file
        tokio::fs::write(repo_path.join("test.txt"), "test content").await.unwrap();
        
        // Repository should now be dirty
        assert!(!backend.validate_clean(&repo_path).await.unwrap());
    }

    #[tokio::test]
    async fn test_cli_backend_worktree_lifecycle() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = create_test_repo(&temp_dir).await.unwrap();
        
        let backend = CliBackend::new(repo_path).unwrap();
        backend.initialize().await.unwrap();
        
        let session_id = "test-session-12345678".to_string();
        let branch_name = "test-branch";
        
        // Create worktree
        let worktree_info = backend.create_worktree(&session_id, "main", branch_name).await.unwrap();
        
        assert_eq!(worktree_info.session_id, session_id);
        assert_eq!(worktree_info.branch_name, branch_name);
        assert_eq!(worktree_info.base_branch, "main");
        assert!(worktree_info.worktree_path.exists());
        assert!(worktree_info.worktree_path.join("AGENT_CONTEXT").exists());
        
        // List worktrees
        let worktrees = backend.list_worktrees().await.unwrap();
        assert_eq!(worktrees.len(), 1);
        assert_eq!(worktrees[0].session_id, session_id);
        
        // Cleanup worktree
        backend.cleanup_worktree(&session_id).await.unwrap();
        
        // Verify cleanup
        assert!(!worktree_info.worktree_path.exists());
        let worktrees = backend.list_worktrees().await.unwrap();
        assert!(worktrees.is_empty());
    }

    #[cfg(feature = "libgit2")]
    #[tokio::test]
    async fn test_libgit2_backend_initialization() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = create_test_repo(&temp_dir).await.unwrap();
        
        let backend = LibGit2Backend::new(repo_path).unwrap();
        backend.initialize().await.unwrap();
        
        assert!(backend.worktrees_dir.exists());
    }

    #[cfg(feature = "libgit2")]
    #[tokio::test]
    async fn test_libgit2_backend_branch_operations() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = create_test_repo(&temp_dir).await.unwrap();
        
        let backend = LibGit2Backend::new(repo_path).unwrap();
        
        // Test existing branches
        assert!(backend.is_branch_existing("main").await.unwrap());
        assert!(!backend.is_branch_existing("nonexistent-branch").await.unwrap());
    }

    #[tokio::test]
    async fn test_factory_function() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = create_test_repo(&temp_dir).await.unwrap();
        
        let backend = create_git_backend(repo_path).unwrap();
        
        // Should create some backend successfully
        assert!(backend.is_branch_existing("main").await.unwrap());
    }

    // Property-based test for create/cleanup/list sequences
    #[tokio::test]
    async fn test_worktree_lifecycle_property() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = create_test_repo(&temp_dir).await.unwrap();
        
        let backend = create_git_backend(repo_path).unwrap();
        backend.initialize().await.unwrap();
        
        let test_sessions = vec![
            "session-1".to_string(),
            "session-2".to_string(),
            "session-3".to_string(),
        ];
        
        // Create multiple worktrees
        for session_id in &test_sessions {
            let branch_name = format!("branch-{}", session_id);
            let worktree_info = backend.create_worktree(session_id, "main", &branch_name).await.unwrap();
            assert_eq!(worktree_info.session_id, *session_id);
        }
        
        // List should show all worktrees
        let worktrees = backend.list_worktrees().await.unwrap();
        assert_eq!(worktrees.len(), test_sessions.len());
        
        // Cleanup all worktrees
        for session_id in &test_sessions {
            backend.cleanup_worktree(session_id).await.unwrap();
        }
        
        // List should be empty
        let worktrees = backend.list_worktrees().await.unwrap();
        assert!(worktrees.is_empty());
    }

    #[tokio::test]
    async fn test_concurrent_operations() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = create_test_repo(&temp_dir).await.unwrap();
        
        let backend = Arc::new(create_git_backend(repo_path).unwrap());
        backend.initialize().await.unwrap();
        
        let mut handles = vec![];
        
        // Create multiple worktrees concurrently
        for i in 0..5 {
            let backend = Arc::clone(&backend);
            let handle = tokio::spawn(async move {
                let session_id = format!("concurrent-session-{}", i);
                let branch_name = format!("concurrent-branch-{}", i);
                
                backend.create_worktree(&session_id, "main", &branch_name).await
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
        let worktrees = backend.list_worktrees().await.unwrap();
        assert_eq!(worktrees.len(), 5);
    }
}
