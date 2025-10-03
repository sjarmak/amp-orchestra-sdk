use crate::domain::*;
use crate::git::*;
use crate::persistence::*;
use std::path::PathBuf;
use tempfile::TempDir;

#[cfg(test)]
mod domain_tests {
    use super::*;

    #[test]
    fn test_session_creation() {
        let session = Session::new(
            "Test Session".to_string(),
            "Test prompt for the session".to_string(),
            PathBuf::from("/tmp/test-repo"),
            "main".to_string(),
        );

        assert!(!session.id.is_empty());
        assert_eq!(session.name, "Test Session");
        assert_eq!(session.prompt, "Test prompt for the session");
        assert_eq!(session.repo_root, PathBuf::from("/tmp/test-repo"));
        assert_eq!(session.base_branch, "main");
        assert!(session.branch_name.starts_with("amp-session-"));
        assert_eq!(session.status, SessionStatus::Initializing);
        assert_eq!(session.worktree_path, PathBuf::from("/tmp/test-repo/.worktrees").join(&session.id));
    }

    #[test]
    fn test_batch_creation() {
        let batch_config = BatchConfig {
            concurrency_limit: 4,
            timeout: std::time::Duration::from_secs(3600),
            retry_policy: RetryPolicy {
                max_attempts: 3,
                backoff_ms: 1000,
                retry_on_failure: true,
            },
            environment: EnvironmentConfig {
                amp_server_url: Some("https://ampcode.com".to_string()),
                amp_cli_path: None,
                agent_modes: vec![AgentMode::Default],
                toolbox_paths: vec![],
            },
            tasks: vec![],
        };

        let batch = Batch::new("Test Batch".to_string(), batch_config);

        assert!(!batch.id.is_empty());
        assert_eq!(batch.name, "Test Batch");
        assert_eq!(batch.status, BatchStatus::Pending);
        assert!(batch.sessions.is_empty());
        assert_eq!(batch.config.concurrency_limit, 4);
    }

    #[test]
    fn test_benchmark_creation() {
        let benchmark = Benchmark::new("Test Benchmark".to_string(), BenchmarkType::Custom);

        assert!(!benchmark.id.is_empty());
        assert_eq!(benchmark.name, "Test Benchmark");
        assert_eq!(benchmark.benchmark_type, BenchmarkType::Custom);
        assert_eq!(benchmark.evaluation_config.parallel_limit, 4);
        assert!(benchmark.results.is_empty());
    }

    #[test]
    fn test_metrics_collector_default() {
        let metrics = MetricsCollector::default();

        assert_eq!(metrics.iterations, 0);
        assert_eq!(metrics.tokens_used, 0);
        assert_eq!(metrics.cost, 0.0);
        assert!(metrics.tools_used.is_empty());
        assert!(metrics.custom_metrics.is_empty());
    }

    #[test]
    fn test_session_status_serialization() {
        let statuses = vec![
            SessionStatus::Initializing,
            SessionStatus::Idle,
            SessionStatus::Running,
            SessionStatus::AwaitingInput,
            SessionStatus::Evaluating,
            SessionStatus::Error("Test error".to_string()),
            SessionStatus::Completed,
        ];

        for status in statuses {
            let json = serde_json::to_string(&status).unwrap();
            let deserialized: SessionStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(status, deserialized);
        }
    }
}

#[cfg(test)]
mod git_tests {
    use super::*;

    #[tokio::test]
    async fn test_cli_backend_creation() {
        let temp_dir = TempDir::new().unwrap();
        let repo_root = temp_dir.path().to_path_buf();
        
        // Create a basic git repo structure
        std::fs::create_dir_all(&repo_root.join(".git")).unwrap();
        
        let result = CliBackend::new(repo_root.clone());
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_git_backend_factory() {
        let temp_dir = TempDir::new().unwrap();
        let repo_root = temp_dir.path().to_path_buf();
        
        // Create a basic git repo structure
        std::fs::create_dir_all(&repo_root.join(".git")).unwrap();
        
        let backend = create_git_backend(repo_root);
        assert!(backend.is_ok());
    }

    #[tokio::test]
    async fn test_validate_clean_nonexistent_path() {
        let temp_dir = TempDir::new().unwrap();
        let repo_root = temp_dir.path().to_path_buf();
        std::fs::create_dir_all(&repo_root.join(".git")).unwrap();
        
        let backend = CliBackend::new(repo_root).unwrap();
        let result = backend.validate_clean(&PathBuf::from("/nonexistent")).await;
        
        assert!(result.is_err());
        matches!(result.unwrap_err(), crate::error::GitError::RepositoryNotFound { .. });
    }
}

#[cfg(test)]
mod persistence_tests {
    use super::*;

    #[tokio::test]
    async fn test_in_memory_store_session_operations() {
        let store = InMemoryStore::new();
        
        let session = Session::new(
            "Test Session".to_string(),
            "Test prompt".to_string(),
            PathBuf::from("/tmp/test"),
            "main".to_string(),
        );
        let session_id = session.id.clone();
        
        // Test create
        let result = store.create_session(&session).await;
        assert!(result.is_ok());
        
        // Test get
        let retrieved = store.get_session(&session_id).await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name, "Test Session");
        
        // Test update
        let mut updated_session = session.clone();
        updated_session.status = SessionStatus::Running;
        let result = store.update_session(&updated_session).await;
        assert!(result.is_ok());
        
        // Test list
        let sessions = store.list_sessions().await.unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].status, SessionStatus::Running);
        
        // Test list by status
        let running_sessions = store.list_sessions_by_status(&SessionStatus::Running).await.unwrap();
        assert_eq!(running_sessions.len(), 1);
        
        let idle_sessions = store.list_sessions_by_status(&SessionStatus::Idle).await.unwrap();
        assert_eq!(idle_sessions.len(), 0);
        
        // Test delete
        let result = store.delete_session(&session_id).await;
        assert!(result.is_ok());
        
        let retrieved = store.get_session(&session_id).await.unwrap();
        assert!(retrieved.is_none());
    }

    #[tokio::test]
    async fn test_in_memory_store_batch_operations() {
        let store = InMemoryStore::new();
        
        let batch_config = BatchConfig {
            concurrency_limit: 4,
            timeout: std::time::Duration::from_secs(3600),
            retry_policy: RetryPolicy {
                max_attempts: 3,
                backoff_ms: 1000,
                retry_on_failure: true,
            },
            environment: EnvironmentConfig {
                amp_server_url: None,
                amp_cli_path: None,
                agent_modes: vec![],
                toolbox_paths: vec![],
            },
            tasks: vec![],
        };
        
        let batch = Batch::new("Test Batch".to_string(), batch_config);
        let batch_id = batch.id.clone();
        
        // Test create
        let result = store.create_batch(&batch).await;
        assert!(result.is_ok());
        
        // Test get
        let retrieved = store.get_batch(&batch_id).await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name, "Test Batch");
        
        // Test list
        let batches = store.list_batches().await.unwrap();
        assert_eq!(batches.len(), 1);
        
        // Test list by status
        let pending_batches = store.list_batches_by_status(&BatchStatus::Pending).await.unwrap();
        assert_eq!(pending_batches.len(), 1);
    }

    #[tokio::test]
    async fn test_in_memory_store_benchmark_operations() {
        let store = InMemoryStore::new();
        
        let benchmark = Benchmark::new("Test Benchmark".to_string(), BenchmarkType::SweBench);
        let benchmark_id = benchmark.id.clone();
        
        // Test create
        let result = store.create_benchmark(&benchmark).await;
        assert!(result.is_ok());
        
        // Test get
        let retrieved = store.get_benchmark(&benchmark_id).await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name, "Test Benchmark");
        
        // Test list
        let benchmarks = store.list_benchmarks().await.unwrap();
        assert_eq!(benchmarks.len(), 1);
        
        // Test list by type
        let swe_benchmarks = store.list_benchmarks_by_type(&BenchmarkType::SweBench).await.unwrap();
        assert_eq!(swe_benchmarks.len(), 1);
        
        let custom_benchmarks = store.list_benchmarks_by_type(&BenchmarkType::Custom).await.unwrap();
        assert_eq!(custom_benchmarks.len(), 0);
    }

    #[tokio::test]
    async fn test_in_memory_store_constraint_violations() {
        let store = InMemoryStore::new();
        
        let session = Session::new(
            "Test Session".to_string(),
            "Test prompt".to_string(),
            PathBuf::from("/tmp/test"),
            "main".to_string(),
        );
        
        // Create session
        store.create_session(&session).await.unwrap();
        
        // Try to create same session again - should fail
        let result = store.create_session(&session).await;
        assert!(result.is_err());
        matches!(result.unwrap_err(), crate::error::PersistenceError::ConstraintViolation { .. });
        
        // Try to update non-existent session - should fail
        let non_existent_session = Session::new(
            "Non-existent".to_string(),
            "Test".to_string(),
            PathBuf::from("/tmp"),
            "main".to_string(),
        );
        
        let result = store.update_session(&non_existent_session).await;
        assert!(result.is_err());
        matches!(result.unwrap_err(), crate::error::PersistenceError::RecordNotFound { .. });
        
        // Try to delete non-existent session - should fail
        let result = store.delete_session(&"non-existent-id".to_string()).await;
        assert!(result.is_err());
        matches!(result.unwrap_err(), crate::error::PersistenceError::RecordNotFound { .. });
    }
}

#[cfg(feature = "legacy_node")]
mod legacy_tests {
    use super::*;
    use crate::legacy_node::*;

    #[test]
    fn test_legacy_session_round_trip() {
        let legacy = LegacySession {
            id: "test-id".to_string(),
            name: "Test Session".to_string(),
            prompt: "Test prompt".to_string(),
            repo_root: "/tmp/test".to_string(),
            base_branch: "main".to_string(),
            branch_name: "test-branch".to_string(),
            worktree_path: "/tmp/test/.worktrees/test-id".to_string(),
            status: "running".to_string(),
            created_at: "2023-01-01T00:00:00Z".to_string(),
            last_run: Some("2023-01-01T01:00:00Z".to_string()),
            node_version: Some("18.0.0".to_string()),
            npm_version: Some("8.0.0".to_string()),
        };

        let session = Session::from_legacy(legacy.clone()).unwrap();
        let back_to_legacy = session.to_legacy();
        
        assert_eq!(back_to_legacy.id, legacy.id);
        assert_eq!(back_to_legacy.name, legacy.name);
        assert_eq!(back_to_legacy.status, legacy.status);
    }

    #[test]
    fn test_legacy_batch_conversion() {
        let legacy = LegacyBatch {
            id: "test-batch-id".to_string(),
            name: "Test Batch".to_string(),
            config_path: "/tmp/config.yaml".to_string(),
            status: "completed".to_string(),
            sessions: vec!["session-1".to_string(), "session-2".to_string()],
            created_at: "2023-01-01T00:00:00Z".to_string(),
            started_at: Some("2023-01-01T01:00:00Z".to_string()),
            completed_at: Some("2023-01-01T02:00:00Z".to_string()),
            total_sessions: 2,
            completed_sessions: 2,
            failed_sessions: 0,
        };

        let batch = Batch::from_legacy(legacy.clone()).unwrap();
        assert_eq!(batch.status, BatchStatus::Completed);
        assert_eq!(batch.sessions.len(), 2);
    }
}
