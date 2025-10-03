//! Tauri IPC commands for Git worktree management
//! 
//! These commands provide the frontend interface to the low-level worktree operations.

use std::path::PathBuf;
use crate::worktree::{self, WorktreeMeta};

/// Tauri command to create a git worktree for a session
/// 
/// # Arguments
/// * `repo_path` - Path to the Git repository root
/// * `session_id` - Session identifier (must be at least 8 characters)
/// 
/// # Returns
/// WorktreeMeta with the created worktree information or error
#[tauri::command]
pub async fn create_git_worktree(
    repo_path: String,
    session_id: String,
) -> Result<WorktreeMeta, String> {
    let repo_path = PathBuf::from(repo_path);
    
    worktree::create(&repo_path, &session_id)
        .map_err(|e| {
            log::error!("Failed to create worktree for session {}: {}", session_id, e);
            e.to_string()
        })
}

/// Tauri command to remove a git worktree and its associated branch
/// 
/// # Arguments
/// * `worktree_path` - Path to the worktree to remove
/// * `branch_name` - Name of the branch to delete
/// * `force` - Whether to force removal even with uncommitted changes
/// 
/// # Returns
/// Empty result or error
#[tauri::command]
pub async fn remove_git_worktree(
    worktree_path: String,
    branch_name: String,
    force: bool,
) -> Result<(), String> {
    let worktree_path = PathBuf::from(worktree_path);
    
    worktree::remove(&worktree_path, &branch_name, force)
        .map_err(|e| {
            log::error!("Failed to remove worktree {}: {}", worktree_path.display(), e);
            e.to_string()
        })
}

/// Tauri command to get the path where a worktree would be created for a session
/// 
/// # Arguments
/// * `repo_path` - Path to the Git repository root
/// * `session_id` - Session identifier
/// 
/// # Returns
/// The path where the worktree would be located
#[tauri::command]
pub async fn get_worktree_path(
    repo_path: String,
    session_id: String,
) -> Result<String, String> {
    let repo_path = PathBuf::from(repo_path);
    let worktree_path = worktree::path_for(&repo_path, &session_id);
    
    Ok(worktree_path.to_string_lossy().to_string())
}

/// Tauri command to check if a repository is clean (no uncommitted changes)
/// 
/// # Arguments
/// * `repo_path` - Path to the Git repository root
/// 
/// # Returns
/// True if the repository is clean, error if dirty or git command fails
#[tauri::command]
pub async fn check_repository_clean(repo_path: String) -> Result<bool, String> {
    use std::process::Command;
    
    let repo_path = PathBuf::from(repo_path);
    
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Git status command failed: {}", 
            String::from_utf8_lossy(&output.stderr)));
    }
    
    let status_output = String::from_utf8(output.stdout)
        .map_err(|e| format!("UTF-8 conversion error: {}", e))?;
    
    Ok(status_output.trim().is_empty())
}

/// Tauri command to list all existing worktrees in the repository
/// 
/// # Arguments
/// * `repo_path` - Path to the Git repository root
/// 
/// # Returns
/// List of worktree paths and their associated branches
#[tauri::command]
pub async fn list_git_worktrees(repo_path: String) -> Result<Vec<GitWorktreeInfo>, String> {
    use std::process::Command;
    
    let repo_path = PathBuf::from(repo_path);
    
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["worktree", "list", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed to run git worktree list: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Git worktree list command failed: {}", 
            String::from_utf8_lossy(&output.stderr)));
    }
    
    let output_str = String::from_utf8(output.stdout)
        .map_err(|e| format!("UTF-8 conversion error: {}", e))?;
    
    let mut worktrees = Vec::new();
    let mut current_worktree: Option<GitWorktreeInfo> = None;
    
    for line in output_str.lines() {
        if line.starts_with("worktree ") {
            // If we have a previous worktree, push it
            if let Some(wt) = current_worktree.take() {
                worktrees.push(wt);
            }
            
            // Start new worktree
            let path = line.strip_prefix("worktree ").unwrap_or("");
            current_worktree = Some(GitWorktreeInfo {
                path: path.to_string(),
                branch: None,
                commit: None,
                is_bare: false,
                is_detached: false,
            });
        } else if line.starts_with("HEAD ") {
            if let Some(ref mut wt) = current_worktree {
                wt.commit = Some(line.strip_prefix("HEAD ").unwrap_or("").to_string());
            }
        } else if line.starts_with("branch ") {
            if let Some(ref mut wt) = current_worktree {
                let branch = line.strip_prefix("branch ").unwrap_or("").to_string();
                wt.branch = Some(branch);
            }
        } else if line == "bare" {
            if let Some(ref mut wt) = current_worktree {
                wt.is_bare = true;
            }
        } else if line == "detached" {
            if let Some(ref mut wt) = current_worktree {
                wt.is_detached = true;
            }
        }
    }
    
    // Don't forget the last worktree
    if let Some(wt) = current_worktree {
        worktrees.push(wt);
    }
    
    Ok(worktrees)
}

/// Information about a Git worktree returned by list command
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitWorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub commit: Option<String>,
    pub is_bare: bool,
    pub is_detached: bool,
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
    
    #[tokio::test]
    async fn test_create_git_worktree_command() {
        let (_temp_dir, repo_path) = create_test_repo();
        let session_id = "test-session-12345678";
        
        let result = create_git_worktree(
            repo_path.to_string_lossy().to_string(),
            session_id.to_string()
        ).await;
        
        assert!(result.is_ok());
        let meta = result.unwrap();
        assert_eq!(meta.session_id, session_id);
        assert!(PathBuf::from(&meta.path).exists());
    }
    
    #[tokio::test]
    async fn test_check_repository_clean_command() {
        let (_temp_dir, repo_path) = create_test_repo();
        
        // Clean repository should return true
        let result = check_repository_clean(repo_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap());
        
        // Make repository dirty
        std::fs::write(repo_path.join("dirty.txt"), "uncommitted").unwrap();
        
        let result = check_repository_clean(repo_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }
    
    #[tokio::test]
    async fn test_get_worktree_path_command() {
        let repo_path = "/test/repo";
        let session_id = "test-session-12345678";
        
        let result = get_worktree_path(repo_path.to_string(), session_id.to_string()).await;
        assert!(result.is_ok());
        
        let path = result.unwrap();
        assert!(path.contains(".amp-worktrees"));
        assert!(path.contains("test-ses"));
    }
    
    #[tokio::test]
    async fn test_list_git_worktrees_command() {
        let (_temp_dir, repo_path) = create_test_repo();
        
        // Initially should have just the main worktree
        let result = list_git_worktrees(repo_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        
        let worktrees = result.unwrap();
        assert!(!worktrees.is_empty());
        
        // Create a session worktree
        let session_id = "test-session-12345678";
        let _meta = create_git_worktree(
            repo_path.to_string_lossy().to_string(),
            session_id.to_string()
        ).await.unwrap();
        
        // Now should have 2 worktrees
        let result = list_git_worktrees(repo_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        
        let worktrees = result.unwrap();
        assert_eq!(worktrees.len(), 2);
    }
    
    #[tokio::test]
    async fn test_remove_git_worktree_command() {
        let (_temp_dir, repo_path) = create_test_repo();
        let session_id = "test-session-12345678";
        
        // Create worktree
        let meta = create_git_worktree(
            repo_path.to_string_lossy().to_string(),
            session_id.to_string()
        ).await.unwrap();
        
        assert!(PathBuf::from(&meta.path).exists());
        
        // Remove worktree
        let result = remove_git_worktree(
            meta.path.to_string_lossy().to_string(),
            meta.branch.clone(),
            false
        ).await;
        
        assert!(result.is_ok());
        assert!(!PathBuf::from(&meta.path).exists());
    }
}
