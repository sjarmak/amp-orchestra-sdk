/// Legacy Node.js compatibility layer
/// This module provides compatibility with existing Node.js-based integrations
/// during the migration to unified architecture.

use crate::domain::{Session, Batch, BatchConfig, BatchStatus, RuntimeConfig, MetricsCollector, BatchMetrics, RetryPolicy, EnvironmentConfig, SessionStatus};
use crate::error::PersistenceError;
use std::path::PathBuf;
use std::time::Duration;
use chrono::{DateTime, Utc};

pub struct LegacyNodeCompat {
    pub enabled: bool,
}

impl LegacyNodeCompat {
    pub fn new() -> Self {
        Self { enabled: true }
    }
    
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
}

impl Default for LegacyNodeCompat {
    fn default() -> Self {
        Self::new()
    }
}

/// Legacy session structure as used by Node.js implementation
#[derive(Debug, Clone)]
pub struct LegacySession {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub repo_root: String,
    pub base_branch: String,
    pub branch_name: String,
    pub worktree_path: String,
    pub status: String,
    pub created_at: String,
    pub last_run: Option<String>,
    pub node_version: Option<String>,
    pub npm_version: Option<String>,
}

/// Legacy batch structure as used by Node.js implementation
#[derive(Debug, Clone)]
pub struct LegacyBatch {
    pub id: String,
    pub name: String,
    pub config_path: String,
    pub status: String,
    pub sessions: Vec<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub total_sessions: i32,
    pub completed_sessions: i32,
    pub failed_sessions: i32,
}

impl Session {
    /// Convert from legacy Node.js session format
    pub fn from_legacy(legacy: LegacySession) -> Result<Self, PersistenceError> {
        let status = match legacy.status.as_str() {
            "idle" => SessionStatus::Idle,
            "running" => SessionStatus::Running,
            "completed" => SessionStatus::Completed,
            _ => SessionStatus::Idle,
        };

        let created_at = legacy.created_at.parse().unwrap_or_else(|_| Utc::now());
        let last_run = legacy.last_run.as_ref()
            .and_then(|s| s.parse().ok());

        Ok(Session {
            id: legacy.id,
            name: legacy.name,
            prompt: legacy.prompt,
            repo_root: PathBuf::from(legacy.repo_root),
            base_branch: legacy.base_branch,
            branch_name: legacy.branch_name,
            worktree_path: PathBuf::from(legacy.worktree_path),
            status,
            agent_mode: None,
            toolbox_path: None,
            mcp_servers: Vec::new(),
            runtime_config: RuntimeConfig::default(),
            benchmark_config: None,
            batch_id: None,
            metrics: MetricsCollector::default(),
            created_at,
            last_run,
            timeout: None,
        })
    }
    
    /// Convert to legacy Node.js session format
    pub fn to_legacy(&self) -> LegacySession {
        let status = match self.status {
            SessionStatus::Idle => "idle".to_string(),
            SessionStatus::Running => "running".to_string(),
            SessionStatus::Completed => "completed".to_string(),
            SessionStatus::Error(ref e) => format!("error: {}", e),
            _ => "idle".to_string(),
        };

        LegacySession {
            id: self.id.clone(),
            name: self.name.clone(),
            prompt: self.prompt.clone(),
            repo_root: self.repo_root.to_string_lossy().to_string(),
            base_branch: self.base_branch.clone(),
            branch_name: self.branch_name.clone(),
            worktree_path: self.worktree_path.to_string_lossy().to_string(),
            status,
            created_at: self.created_at.to_rfc3339(),
            last_run: self.last_run.map(|dt| dt.to_rfc3339()),
            node_version: None, // Not available in new structure
            npm_version: None,  // Not available in new structure
        }
    }
}

impl Batch {
    /// Convert from legacy Node.js batch format
    pub fn from_legacy(legacy: LegacyBatch) -> Result<Self, PersistenceError> {
        let status = match legacy.status.as_str() {
            "pending" => BatchStatus::Pending,
            "running" => BatchStatus::Running,
            "completed" => BatchStatus::Completed,
            "failed" => BatchStatus::Failed,
            _ => BatchStatus::Pending,
        };

        let config = BatchConfig {
            concurrency_limit: 1,
            timeout: Duration::from_secs(3600),
            retry_policy: RetryPolicy {
                max_attempts: 3,
                backoff_ms: 1000,
                retry_on_failure: true,
            },
            environment: EnvironmentConfig {
                amp_server_url: None,
                amp_cli_path: None,
                agent_modes: Vec::new(),
                toolbox_paths: Vec::new(),
            },
            tasks: Vec::new(),
        };

        let created_at = legacy.created_at.parse().unwrap_or_else(|_| Utc::now());
        let started_at = legacy.started_at.as_ref().and_then(|s| s.parse().ok());
        let completed_at = legacy.completed_at.as_ref().and_then(|s| s.parse().ok());

        Ok(Batch {
            id: legacy.id,
            name: legacy.name,
            description: None,
            config,
            status,
            sessions: legacy.sessions,
            created_at,
            started_at,
            completed_at,
            metrics: BatchMetrics::default(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_legacy_node_compat() {
        let compat = LegacyNodeCompat::new();
        assert!(compat.is_enabled());
    }

    #[test]
    fn test_legacy_session_conversion() {
        let legacy = LegacySession {
            id: "test-id".to_string(),
            name: "Test".to_string(),
            prompt: "Test prompt".to_string(),
            repo_root: "/tmp/test".to_string(),
            base_branch: "main".to_string(),
            branch_name: "test-branch".to_string(),
            worktree_path: "/tmp/worktree".to_string(),
            status: "running".to_string(),
            created_at: "2023-01-01T00:00:00Z".to_string(),
            last_run: None,
            node_version: Some("18.0.0".to_string()),
            npm_version: Some("8.0.0".to_string()),
        };

        let session = Session::from_legacy(legacy).unwrap();
        assert_eq!(session.id, "test-id");
        assert_eq!(session.name, "Test");
    }
}
