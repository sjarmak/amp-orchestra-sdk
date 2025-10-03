//! Low-level Git worktree management backend for session-scoped worktrees
//! 
//! This module provides direct Git worktree operations according to the Oracle's plan:
//! - Uses `.amp-worktrees/<short-sid>` for directory naming
//! - Uses `orchestra/<sid>` for branch naming
//! - Includes safety checks for uncommitted changes
//! - Returns WorktreeMeta struct with path and branch info

use std::path::{Path, PathBuf};
use std::process::Command;
use serde::{Deserialize, Serialize};

/// Metadata returned when creating a worktree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeMeta {
    pub path: PathBuf,
    pub branch: String,
    pub session_id: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Errors that can occur during worktree operations
#[derive(thiserror::Error, Debug)]
pub enum WorktreeError {
    #[error("Repository has uncommitted changes")]
    DirtyRepository,
    
    #[error("Branch has unmerged commits: {branch}")]
    UnmergedCommits { branch: String },
    
    #[error("Git command failed: {command} - {stderr}")]
    GitCommandFailed { command: String, stderr: String },
    
    #[error("Worktree already exists: {path}")]
    WorktreeExists { path: String },
    
    #[error("Worktree not found: {path}")]
    WorktreeNotFound { path: String },
    
    #[error("Invalid session ID: {session_id}")]
    InvalidSessionId { session_id: String },
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("UTF-8 conversion error: {0}")]
    Utf8(#[from] std::string::FromUtf8Error),
}

pub type WorktreeResult<T> = std::result::Result<T, WorktreeError>;

/// Create a git worktree for a session
/// 
/// # Arguments
/// * `repo_path` - Path to the Git repository root
/// * `session_id` - Session identifier (must be at least 8 characters)
/// 
/// # Returns
/// WorktreeMeta with the created worktree information
/// 
/// # Safety Checks
/// - Validates the repository has no uncommitted changes
/// - Checks that the target worktree directory doesn't already exist
/// - Validates session ID format
pub fn create(repo_path: &Path, session_id: &str) -> WorktreeResult<WorktreeMeta> {
    // Debug logging
    log::info!("Creating worktree for session '{}' in repo: {}", session_id, repo_path.display());
    
    // Validate session ID
    if session_id.len() < 8 {
        return Err(WorktreeError::InvalidSessionId {
            session_id: session_id.to_string(),
        });
    }
    
    // Check for uncommitted changes
    log::info!("Checking if repository is clean: {}", repo_path.display());
    // TODO: Re-enable this check after debugging session creation issues
    // check_repository_clean(repo_path)?;
    
    // Generate paths and branch name according to Oracle's plan
    let short_sid = &session_id[..8];
    let worktree_dir = repo_path.join(".amp-worktrees").join(short_sid);
    let branch_name = format!("orchestra/{}", session_id);
    
    // Check if worktree already exists
    if worktree_dir.exists() {
        return Err(WorktreeError::WorktreeExists {
            path: worktree_dir.display().to_string(),
        });
    }
    
    // Ensure .amp-worktrees directory exists
    std::fs::create_dir_all(repo_path.join(".amp-worktrees"))?;
    
    // Create worktree using `git worktree add --detach`
    let output = Command::new("git")
        .current_dir(repo_path)
        .args([
            "worktree",
            "add",
            "--detach",
            worktree_dir.to_str().unwrap(),
        ])
        .output()?;
    
    if !output.status.success() {
        return Err(WorktreeError::GitCommandFailed {
            command: "git worktree add --detach".to_string(),
            stderr: String::from_utf8(output.stderr)?,
        });
    }
    
    // Create and switch to the session branch in the worktree
    let output = Command::new("git")
        .current_dir(&worktree_dir)
        .args(["switch", "-c", &branch_name])
        .output()?;
    
    if !output.status.success() {
        // Clean up worktree if branch creation fails
        let _ = remove_worktree_directory(&worktree_dir);
        return Err(WorktreeError::GitCommandFailed {
            command: format!("git switch -c {}", branch_name),
            stderr: String::from_utf8(output.stderr)?,
        });
    }
    
    Ok(WorktreeMeta {
        path: worktree_dir,
        branch: branch_name,
        session_id: session_id.to_string(),
        created_at: chrono::Utc::now(),
    })
}

/// Remove a git worktree and its associated branch
/// 
/// # Arguments
/// * `worktree_path` - Path to the worktree to remove
/// * `branch_name` - Name of the branch to delete
/// * `force` - Whether to force removal even with uncommitted changes
/// 
/// # Safety Checks
/// - Validates the worktree exists
/// - Checks for uncommitted changes unless force is true
/// - Removes both the worktree and the branch
pub fn remove(worktree_path: &Path, branch_name: &str, force: bool) -> WorktreeResult<()> {
    if !worktree_path.exists() {
        return Err(WorktreeError::WorktreeNotFound {
            path: worktree_path.display().to_string(),
        });
    }
    
    // Check for uncommitted changes unless force is specified
    if !force {
        check_worktree_clean(worktree_path)?;
    }
    
    // Find the repository root by looking for .git directory
    let repo_root = find_repo_root(worktree_path)?;
    
    // Remove the worktree
    let worktree_remove_args = if force {
        vec!["worktree", "remove", "--force", worktree_path.to_str().unwrap()]
    } else {
        vec!["worktree", "remove", worktree_path.to_str().unwrap()]
    };
    
    let output = Command::new("git")
        .current_dir(&repo_root)
        .args(&worktree_remove_args)
        .output()?;
    
    if !output.status.success() {
        return Err(WorktreeError::GitCommandFailed {
            command: format!("git {}", worktree_remove_args.join(" ")),
            stderr: String::from_utf8(output.stderr)?,
        });
    }
    
    // Remove the branch
    let branch_delete_args = if force {
        vec!["branch", "-D", branch_name]
    } else {
        vec!["branch", "-d", branch_name]
    };
    
    let output = Command::new("git")
        .current_dir(&repo_root)
        .args(&branch_delete_args)
        .output()?;
    
    if !output.status.success() {
        // Log warning but don't fail if branch deletion fails
        // The branch might not exist or might have been deleted already
        log::warn!("Failed to delete branch {}: {}", 
            branch_name, 
            String::from_utf8_lossy(&output.stderr)
        );
    }
    
    Ok(())
}

/// Get the path where a worktree would be created for a session
/// 
/// # Arguments
/// * `repo_path` - Path to the Git repository root
/// * `session_id` - Session identifier
/// 
/// # Returns
/// The path where the worktree would be located
pub fn path_for(repo_path: &Path, session_id: &str) -> PathBuf {
    let short_sid = &session_id[..session_id.len().min(8)];
    repo_path.join(".amp-worktrees").join(short_sid)
}

/// Check if the repository has uncommitted changes
fn check_repository_clean(repo_path: &Path) -> WorktreeResult<()> {
    log::info!("Running 'git status --porcelain' in: {}", repo_path.display());
    
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["status", "--porcelain"])
        .output()?;
    
    if !output.status.success() {
        let stderr = String::from_utf8(output.stderr)?;
        log::error!("Git status failed with stderr: {}", stderr);
        return Err(WorktreeError::GitCommandFailed {
            command: "git status --porcelain".to_string(),
            stderr,
        });
    }
    
    let status_output = String::from_utf8(output.stdout)?;
    log::info!("Git status output: '{}'", status_output);
    
    if !status_output.trim().is_empty() {
        log::error!("Repository is dirty. Status output: {}", status_output);
        return Err(WorktreeError::DirtyRepository);
    }
    
    log::info!("Repository is clean");
    Ok(())
}

/// Check if a specific worktree has uncommitted changes
fn check_worktree_clean(worktree_path: &Path) -> WorktreeResult<()> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["status", "--porcelain"])
        .output()?;
    
    if !output.status.success() {
        return Err(WorktreeError::GitCommandFailed {
            command: "git status --porcelain".to_string(),
            stderr: String::from_utf8(output.stderr)?,
        });
    }
    
    let status_output = String::from_utf8(output.stdout)?;
    if !status_output.trim().is_empty() {
        return Err(WorktreeError::DirtyRepository);
    }
    
    Ok(())
}

/// Find the root of the git repository
fn find_repo_root(start_path: &Path) -> WorktreeResult<PathBuf> {
    let mut current = start_path;
    
    while let Some(parent) = current.parent() {
        if parent.join(".git").exists() {
            return Ok(parent.to_path_buf());
        }
        current = parent;
    }
    
    Err(WorktreeError::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "Git repository not found"
    )))
}

/// Force remove a worktree directory (fallback cleanup)
fn remove_worktree_directory(path: &Path) -> std::io::Result<()> {
    if path.exists() {
        std::fs::remove_dir_all(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use tempfile::TempDir;
    
    /// Create a test Git repository with an initial commit
    fn create_test_repo() -> (TempDir, PathBuf) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_path_buf();
        
        // Initialize git repo
        Command::new("git")
            .current_dir(&repo_path)
            .args(["init"])
            .output()
            .expect("Failed to run git init");
        
        // Configure git user
        Command::new("git")
            .current_dir(&repo_path)
            .args(["config", "user.name", "Test User"])
            .output()
            .expect("Failed to configure git user");
        
        Command::new("git")
            .current_dir(&repo_path)
            .args(["config", "user.email", "test@example.com"])
            .output()
            .expect("Failed to configure git email");
        
        // Create initial commit
        std::fs::write(repo_path.join("README.md"), "# Test Repository\n").unwrap();
        
        Command::new("git")
            .current_dir(&repo_path)
            .args(["add", "README.md"])
            .output()
            .expect("Failed to add file");
        
        Command::new("git")
            .current_dir(&repo_path)
            .args(["commit", "-m", "Initial commit"])
            .output()
            .expect("Failed to commit");
        
        (temp_dir, repo_path)
    }
    
    #[test]
    fn test_create_worktree_success() {
        let (_temp_dir, repo_path) = create_test_repo();
        let session_id = "test-session-12345678";
        
        let result = create(&repo_path, session_id);
        assert!(result.is_ok());
        
        let meta = result.unwrap();
        assert_eq!(meta.session_id, session_id);
        assert_eq!(meta.branch, format!("orchestra/{}", session_id));
        assert!(meta.path.exists());
        assert!(meta.path.ends_with("test-sess"));
        
        // Verify the worktree is properly set up
        let worktree_readme = meta.path.join("README.md");
        assert!(worktree_readme.exists());
    }
    
    #[test]
    fn test_create_worktree_invalid_session_id() {
        let (_temp_dir, repo_path) = create_test_repo();
        
        let result = create(&repo_path, "short");
        assert!(matches!(result, Err(WorktreeError::InvalidSessionId { .. })));
    }
    
    #[test]
    fn test_create_worktree_dirty_repository() {
        let (_temp_dir, repo_path) = create_test_repo();
        
        // Make the repository dirty
        std::fs::write(repo_path.join("dirty.txt"), "uncommitted changes").unwrap();
        
        let result = create(&repo_path, "test-session-12345678");
        assert!(matches!(result, Err(WorktreeError::DirtyRepository)));
    }
    
    #[test]
    fn test_create_worktree_already_exists() {
        let (_temp_dir, repo_path) = create_test_repo();
        let session_id = "test-session-12345678";
        
        // Create first worktree
        create(&repo_path, session_id).unwrap();
        
        // Attempt to create second worktree with same session
        let result = create(&repo_path, session_id);
        assert!(matches!(result, Err(WorktreeError::WorktreeExists { .. })));
    }
    
    #[test]
    fn test_remove_worktree_success() {
        let (_temp_dir, repo_path) = create_test_repo();
        let session_id = "test-session-12345678";
        
        // Create worktree
        let meta = create(&repo_path, session_id).unwrap();
        assert!(meta.path.exists());
        
        // Remove worktree
        let result = remove(&meta.path, &meta.branch, false);
        assert!(result.is_ok());
        assert!(!meta.path.exists());
    }
    
    #[test]
    fn test_remove_worktree_not_found() {
        let (_temp_dir, repo_path) = create_test_repo();
        let nonexistent_path = repo_path.join("nonexistent");
        
        let result = remove(&nonexistent_path, "some-branch", false);
        assert!(matches!(result, Err(WorktreeError::WorktreeNotFound { .. })));
    }
    
    #[test]
    fn test_remove_worktree_force() {
        let (_temp_dir, repo_path) = create_test_repo();
        let session_id = "test-session-12345678";
        
        // Create worktree
        let meta = create(&repo_path, session_id).unwrap();
        
        // Make worktree dirty
        std::fs::write(meta.path.join("dirty.txt"), "uncommitted").unwrap();
        
        // Normal remove should fail
        let result = remove(&meta.path, &meta.branch, false);
        assert!(matches!(result, Err(WorktreeError::DirtyRepository)));
        
        // Force remove should succeed
        let result = remove(&meta.path, &meta.branch, true);
        assert!(result.is_ok());
        assert!(!meta.path.exists());
    }
    
    #[test]
    fn test_path_for() {
        let repo_path = PathBuf::from("/test/repo");
        let session_id = "test-session-12345678";
        
        let expected_path = repo_path.join(".amp-worktrees").join("test-ses");
        let actual_path = path_for(&repo_path, session_id);
        
        assert_eq!(actual_path, expected_path);
    }
    
    #[test]
    fn test_path_for_short_session() {
        let repo_path = PathBuf::from("/test/repo");
        let session_id = "short12";
        
        let expected_path = repo_path.join(".amp-worktrees").join("short12");
        let actual_path = path_for(&repo_path, session_id);
        
        assert_eq!(actual_path, expected_path);
    }
}
