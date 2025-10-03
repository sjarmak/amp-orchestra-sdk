use async_trait::async_trait;
use crate::domain::{Session, SessionId, Batch, BatchId, Benchmark, BenchmarkId};
use crate::error::{PersistenceError, PersistenceResult};

/// Trait for session persistence operations
#[async_trait]
pub trait SessionStore: Send + Sync {
    /// Create a new session in storage
    async fn create_session(&self, session: &Session) -> PersistenceResult<()>;
    
    /// Get a session by ID
    async fn get_session(&self, session_id: &SessionId) -> PersistenceResult<Option<Session>>;
    
    /// Update an existing session
    async fn update_session(&self, session: &Session) -> PersistenceResult<()>;
    
    /// Delete a session by ID
    async fn delete_session(&self, session_id: &SessionId) -> PersistenceResult<()>;
    
    /// List all sessions
    async fn list_sessions(&self) -> PersistenceResult<Vec<Session>>;
    
    /// List sessions by status
    async fn list_sessions_by_status(&self, status: &crate::domain::SessionStatus) -> PersistenceResult<Vec<Session>>;
    
    /// List sessions by batch ID
    async fn list_sessions_by_batch(&self, batch_id: &BatchId) -> PersistenceResult<Vec<Session>>;
}

/// Trait for batch persistence operations
#[async_trait]
pub trait BatchStore: Send + Sync {
    /// Create a new batch in storage
    async fn create_batch(&self, batch: &Batch) -> PersistenceResult<()>;
    
    /// Get a batch by ID
    async fn get_batch(&self, batch_id: &BatchId) -> PersistenceResult<Option<Batch>>;
    
    /// Update an existing batch
    async fn update_batch(&self, batch: &Batch) -> PersistenceResult<()>;
    
    /// Delete a batch by ID
    async fn delete_batch(&self, batch_id: &BatchId) -> PersistenceResult<()>;
    
    /// List all batches
    async fn list_batches(&self) -> PersistenceResult<Vec<Batch>>;
    
    /// List batches by status
    async fn list_batches_by_status(&self, status: &crate::domain::BatchStatus) -> PersistenceResult<Vec<Batch>>;
}

/// Trait for benchmark persistence operations
#[async_trait]
pub trait BenchmarkStore: Send + Sync {
    /// Create a new benchmark in storage
    async fn create_benchmark(&self, benchmark: &Benchmark) -> PersistenceResult<()>;
    
    /// Get a benchmark by ID
    async fn get_benchmark(&self, benchmark_id: &BenchmarkId) -> PersistenceResult<Option<Benchmark>>;
    
    /// Update an existing benchmark
    async fn update_benchmark(&self, benchmark: &Benchmark) -> PersistenceResult<()>;
    
    /// Delete a benchmark by ID
    async fn delete_benchmark(&self, benchmark_id: &BenchmarkId) -> PersistenceResult<()>;
    
    /// List all benchmarks
    async fn list_benchmarks(&self) -> PersistenceResult<Vec<Benchmark>>;
    
    /// List benchmarks by type
    async fn list_benchmarks_by_type(&self, benchmark_type: &crate::domain::BenchmarkType) -> PersistenceResult<Vec<Benchmark>>;
}

/// Combined store trait that includes all persistence operations
/// This provides a unified interface for WorktreeManager and other components
pub trait Store: SessionStore + BatchStore + BenchmarkStore + Send + Sync {}

/// In-memory implementation for testing and development
#[derive(Debug, Default)]
pub struct InMemoryStore {
    sessions: std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<SessionId, Session>>>,
    batches: std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<BatchId, Batch>>>,
    benchmarks: std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<BenchmarkId, Benchmark>>>,
}

impl InMemoryStore {
    pub fn new() -> Self {
        Self::default()
    }
}

#[async_trait]
impl SessionStore for InMemoryStore {
    async fn create_session(&self, session: &Session) -> PersistenceResult<()> {
        let mut sessions = self.sessions.write().await;
        
        if sessions.contains_key(&session.id) {
            return Err(PersistenceError::ConstraintViolation {
                constraint: format!("Session with id {} already exists", session.id),
            });
        }
        
        sessions.insert(session.id.clone(), session.clone());
        Ok(())
    }
    
    async fn get_session(&self, session_id: &SessionId) -> PersistenceResult<Option<Session>> {
        let sessions = self.sessions.read().await;
        Ok(sessions.get(session_id).cloned())
    }
    
    async fn update_session(&self, session: &Session) -> PersistenceResult<()> {
        let mut sessions = self.sessions.write().await;
        
        if !sessions.contains_key(&session.id) {
            return Err(PersistenceError::RecordNotFound {
                table: "sessions".to_string(),
                id: session.id.clone(),
            });
        }
        
        sessions.insert(session.id.clone(), session.clone());
        Ok(())
    }
    
    async fn delete_session(&self, session_id: &SessionId) -> PersistenceResult<()> {
        let mut sessions = self.sessions.write().await;
        
        if sessions.remove(session_id).is_none() {
            return Err(PersistenceError::RecordNotFound {
                table: "sessions".to_string(),
                id: session_id.clone(),
            });
        }
        
        Ok(())
    }
    
    async fn list_sessions(&self) -> PersistenceResult<Vec<Session>> {
        let sessions = self.sessions.read().await;
        Ok(sessions.values().cloned().collect())
    }
    
    async fn list_sessions_by_status(&self, status: &crate::domain::SessionStatus) -> PersistenceResult<Vec<Session>> {
        let sessions = self.sessions.read().await;
        Ok(sessions.values()
            .filter(|session| &session.status == status)
            .cloned()
            .collect())
    }
    
    async fn list_sessions_by_batch(&self, batch_id: &BatchId) -> PersistenceResult<Vec<Session>> {
        let sessions = self.sessions.read().await;
        Ok(sessions.values()
            .filter(|session| session.batch_id.as_ref() == Some(batch_id))
            .cloned()
            .collect())
    }
}

#[async_trait]
impl BatchStore for InMemoryStore {
    async fn create_batch(&self, batch: &Batch) -> PersistenceResult<()> {
        let mut batches = self.batches.write().await;
        
        if batches.contains_key(&batch.id) {
            return Err(PersistenceError::ConstraintViolation {
                constraint: format!("Batch with id {} already exists", batch.id),
            });
        }
        
        batches.insert(batch.id.clone(), batch.clone());
        Ok(())
    }
    
    async fn get_batch(&self, batch_id: &BatchId) -> PersistenceResult<Option<Batch>> {
        let batches = self.batches.read().await;
        Ok(batches.get(batch_id).cloned())
    }
    
    async fn update_batch(&self, batch: &Batch) -> PersistenceResult<()> {
        let mut batches = self.batches.write().await;
        
        if !batches.contains_key(&batch.id) {
            return Err(PersistenceError::RecordNotFound {
                table: "batches".to_string(),
                id: batch.id.clone(),
            });
        }
        
        batches.insert(batch.id.clone(), batch.clone());
        Ok(())
    }
    
    async fn delete_batch(&self, batch_id: &BatchId) -> PersistenceResult<()> {
        let mut batches = self.batches.write().await;
        
        if batches.remove(batch_id).is_none() {
            return Err(PersistenceError::RecordNotFound {
                table: "batches".to_string(),
                id: batch_id.clone(),
            });
        }
        
        Ok(())
    }
    
    async fn list_batches(&self) -> PersistenceResult<Vec<Batch>> {
        let batches = self.batches.read().await;
        Ok(batches.values().cloned().collect())
    }
    
    async fn list_batches_by_status(&self, status: &crate::domain::BatchStatus) -> PersistenceResult<Vec<Batch>> {
        let batches = self.batches.read().await;
        Ok(batches.values()
            .filter(|batch| &batch.status == status)
            .cloned()
            .collect())
    }
}

#[async_trait]
impl BenchmarkStore for InMemoryStore {
    async fn create_benchmark(&self, benchmark: &Benchmark) -> PersistenceResult<()> {
        let mut benchmarks = self.benchmarks.write().await;
        
        if benchmarks.contains_key(&benchmark.id) {
            return Err(PersistenceError::ConstraintViolation {
                constraint: format!("Benchmark with id {} already exists", benchmark.id),
            });
        }
        
        benchmarks.insert(benchmark.id.clone(), benchmark.clone());
        Ok(())
    }
    
    async fn get_benchmark(&self, benchmark_id: &BenchmarkId) -> PersistenceResult<Option<Benchmark>> {
        let benchmarks = self.benchmarks.read().await;
        Ok(benchmarks.get(benchmark_id).cloned())
    }
    
    async fn update_benchmark(&self, benchmark: &Benchmark) -> PersistenceResult<()> {
        let mut benchmarks = self.benchmarks.write().await;
        
        if !benchmarks.contains_key(&benchmark.id) {
            return Err(PersistenceError::RecordNotFound {
                table: "benchmarks".to_string(),
                id: benchmark.id.clone(),
            });
        }
        
        benchmarks.insert(benchmark.id.clone(), benchmark.clone());
        Ok(())
    }
    
    async fn delete_benchmark(&self, benchmark_id: &BenchmarkId) -> PersistenceResult<()> {
        let mut benchmarks = self.benchmarks.write().await;
        
        if benchmarks.remove(benchmark_id).is_none() {
            return Err(PersistenceError::RecordNotFound {
                table: "benchmarks".to_string(),
                id: benchmark_id.clone(),
            });
        }
        
        Ok(())
    }
    
    async fn list_benchmarks(&self) -> PersistenceResult<Vec<Benchmark>> {
        let benchmarks = self.benchmarks.read().await;
        Ok(benchmarks.values().cloned().collect())
    }
    
    async fn list_benchmarks_by_type(&self, benchmark_type: &crate::domain::BenchmarkType) -> PersistenceResult<Vec<Benchmark>> {
        let benchmarks = self.benchmarks.read().await;
        Ok(benchmarks.values()
            .filter(|benchmark| &benchmark.benchmark_type == benchmark_type)
            .cloned()
            .collect())
    }
}

/// Blanket implementation of Store for InMemoryStore
impl Store for InMemoryStore {}

// Re-export SqliteStore when persistence feature is enabled
#[cfg(feature = "persistence")]
pub use sqlx_impl::SqliteStore;

#[cfg(feature = "persistence")]
pub mod sqlx_impl {
    use super::*;
    use crate::domain::{SessionId, BatchId, BenchmarkId};
    use sqlx::SqlitePool;

    /// SQLite implementation using sqlx
    pub struct SqliteStore {
        pool: SqlitePool,
    }

    impl SqliteStore {
        pub fn new(pool: SqlitePool) -> Self {
            Self { pool }
        }

        /// Initialize database tables
        pub async fn initialize(&self) -> PersistenceResult<()> {
            sqlx::query(r#"
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    repo_root TEXT NOT NULL,
                    base_branch TEXT NOT NULL,
                    branch_name TEXT NOT NULL,
                    worktree_path TEXT NOT NULL,
                    status TEXT NOT NULL,
                    agent_mode TEXT,
                    toolbox_path TEXT,
                    mcp_servers TEXT, -- JSON
                    runtime_config TEXT NOT NULL, -- JSON
                    benchmark_config TEXT, -- JSON
                    batch_id TEXT,
                    metrics TEXT NOT NULL, -- JSON
                    created_at TEXT NOT NULL,
                    last_run TEXT,
                    timeout_secs INTEGER
                )
            "#)
            .execute(&self.pool)
            .await
            .map_err(|e| PersistenceError::Database(e.to_string()))?;

            sqlx::query(r#"
                CREATE TABLE IF NOT EXISTS batches (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    config TEXT NOT NULL, -- JSON
                    status TEXT NOT NULL,
                    sessions TEXT NOT NULL, -- JSON array
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    metrics TEXT NOT NULL -- JSON
                )
            "#)
            .execute(&self.pool)
            .await
            .map_err(|e| PersistenceError::Database(e.to_string()))?;

            sqlx::query(r#"
                CREATE TABLE IF NOT EXISTS benchmarks (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    benchmark_type TEXT NOT NULL,
                    dataset_info TEXT NOT NULL, -- JSON
                    evaluation_config TEXT NOT NULL, -- JSON
                    results TEXT NOT NULL, -- JSON
                    created_at TEXT NOT NULL
                )
            "#)
            .execute(&self.pool)
            .await
            .map_err(|e| PersistenceError::Database(e.to_string()))?;

            Ok(())
        }
    }

    #[async_trait]
    impl SessionStore for SqliteStore {
        async fn create_session(&self, session: &Session) -> PersistenceResult<()> {
            let agent_mode = session.agent_mode.as_ref().map(|am| match am {
                crate::domain::AgentMode::Default => "default",
                crate::domain::AgentMode::Geppetto => "geppetto",
                crate::domain::AgentMode::Claudetto => "claudetto",
                crate::domain::AgentMode::GronkFast => "gronk:fast",
                crate::domain::AgentMode::Bolt => "bolt",
                crate::domain::AgentMode::Custom(custom) => custom,
            });

            let status = match &session.status {
                crate::domain::SessionStatus::Initializing => "initializing",
                crate::domain::SessionStatus::Idle => "idle",
                crate::domain::SessionStatus::Running => "running",
                crate::domain::SessionStatus::AwaitingInput => "awaiting_input",
                crate::domain::SessionStatus::Evaluating => "evaluating",
                crate::domain::SessionStatus::Error(e) => &format!("error:{}", e),
                crate::domain::SessionStatus::Completed => "completed",
            };

            let mcp_servers = serde_json::to_string(&session.mcp_servers)
                .map_err(|e| PersistenceError::SerializationError(e.to_string()))?;
            
            let runtime_config = serde_json::to_string(&session.runtime_config)
                .map_err(|e| PersistenceError::SerializationError(e.to_string()))?;
            
            let benchmark_config = session.benchmark_config.as_ref()
                .map(|bc| serde_json::to_string(bc))
                .transpose()
                .map_err(|e| PersistenceError::SerializationError(e.to_string()))?;
            
            let metrics = serde_json::to_string(&session.metrics)
                .map_err(|e| PersistenceError::SerializationError(e.to_string()))?;

            let timeout_secs = session.timeout.map(|t| t.as_secs() as i64);

            sqlx::query(r#"
                INSERT INTO sessions (
                    id, name, prompt, repo_root, base_branch, branch_name, worktree_path,
                    status, agent_mode, toolbox_path, mcp_servers, runtime_config,
                    benchmark_config, batch_id, metrics, created_at, last_run, timeout_secs
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#)
            .bind(&session.id)
            .bind(&session.name)
            .bind(&session.prompt)
            .bind(session.repo_root.to_string_lossy())
            .bind(&session.base_branch)
            .bind(&session.branch_name)
            .bind(session.worktree_path.to_string_lossy())
            .bind(status)
            .bind(agent_mode)
            .bind(session.toolbox_path.as_ref().map(|p| p.to_string_lossy().to_string()))
            .bind(mcp_servers)
            .bind(runtime_config)
            .bind(benchmark_config)
            .bind(&session.batch_id)
            .bind(metrics)
            .bind(session.created_at.to_rfc3339())
            .bind(session.last_run.as_ref().map(|lr| lr.to_rfc3339()))
            .bind(timeout_secs)
            .execute(&self.pool)
            .await
            .map_err(|e| PersistenceError::Database(e.to_string()))?;

            Ok(())
        }

        async fn get_session(&self, session_id: &SessionId) -> PersistenceResult<Option<Session>> {
            let row = sqlx::query(r#"
                SELECT id, name, prompt, repo_root, base_branch, branch_name, worktree_path,
                       status, agent_mode, toolbox_path, mcp_servers, runtime_config,
                       benchmark_config, batch_id, metrics, created_at, last_run, timeout_secs
                FROM sessions WHERE id = ?
            "#)
            .bind(session_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| PersistenceError::Database(e.to_string()))?;

            match row {
                Some(row) => {
                    let session = self.row_to_session(row)?;
                    Ok(Some(session))
                }
                None => Ok(None),
            }
        }

        async fn update_session(&self, session: &Session) -> PersistenceResult<()> {
            let agent_mode = session.agent_mode.as_ref().map(|am| match am {
                crate::domain::AgentMode::Default => "default",
                crate::domain::AgentMode::Geppetto => "geppetto",
                crate::domain::AgentMode::Claudetto => "claudetto",
                crate::domain::AgentMode::GronkFast => "gronk:fast",
                crate::domain::AgentMode::Bolt => "bolt",
                crate::domain::AgentMode::Custom(custom) => custom,
            });

            let status = match &session.status {
                crate::domain::SessionStatus::Initializing => "initializing",
                crate::domain::SessionStatus::Idle => "idle",
                crate::domain::SessionStatus::Running => "running",
                crate::domain::SessionStatus::AwaitingInput => "awaiting_input",
                crate::domain::SessionStatus::Evaluating => "evaluating",
                crate::domain::SessionStatus::Error(e) => &format!("error:{}", e),
                crate::domain::SessionStatus::Completed => "completed",
            };

            let mcp_servers = serde_json::to_string(&session.mcp_servers)
                .map_err(|e| PersistenceError::SerializationError(e.to_string()))?;
            
            let runtime_config = serde_json::to_string(&session.runtime_config)
                .map_err(|e| PersistenceError::SerializationError(e.to_string()))?;
            
            let benchmark_config = session.benchmark_config.as_ref()
                .map(|bc| serde_json::to_string(bc))
                .transpose()
                .map_err(|e| PersistenceError::SerializationError(e.to_string()))?;
            
            let metrics = serde_json::to_string(&session.metrics)
                .map_err(|e| PersistenceError::SerializationError(e.to_string()))?;

            let timeout_secs = session.timeout.map(|t| t.as_secs() as i64);

            let result = sqlx::query(r#"
                UPDATE sessions SET
                    name = ?, prompt = ?, repo_root = ?, base_branch = ?, branch_name = ?,
                    worktree_path = ?, status = ?, agent_mode = ?, toolbox_path = ?,
                    mcp_servers = ?, runtime_config = ?, benchmark_config = ?, batch_id = ?,
                    metrics = ?, last_run = ?, timeout_secs = ?
                WHERE id = ?
            "#)
            .bind(&session.name)
            .bind(&session.prompt)
            .bind(session.repo_root.to_string_lossy())
            .bind(&session.base_branch)
            .bind(&session.branch_name)
            .bind(session.worktree_path.to_string_lossy())
            .bind(status)
            .bind(agent_mode)
            .bind(session.toolbox_path.as_ref().map(|p| p.to_string_lossy().to_string()))
            .bind(mcp_servers)
            .bind(runtime_config)
            .bind(benchmark_config)
            .bind(&session.batch_id)
            .bind(metrics)
            .bind(session.last_run.as_ref().map(|lr| lr.to_rfc3339()))
            .bind(timeout_secs)
            .bind(&session.id)
            .execute(&self.pool)
            .await
            .map_err(|e| PersistenceError::Database(e.to_string()))?;

            if result.rows_affected() == 0 {
                return Err(PersistenceError::RecordNotFound {
                    table: "sessions".to_string(),
                    id: session.id.clone(),
                });
            }

            Ok(())
        }

        async fn delete_session(&self, session_id: &SessionId) -> PersistenceResult<()> {
            let result = sqlx::query("DELETE FROM sessions WHERE id = ?")
                .bind(session_id)
                .execute(&self.pool)
                .await
                .map_err(|e| PersistenceError::Database(e.to_string()))?;

            if result.rows_affected() == 0 {
                return Err(PersistenceError::RecordNotFound {
                    table: "sessions".to_string(),
                    id: session_id.to_string(),
                });
            }

            Ok(())
        }

        async fn list_sessions(&self) -> PersistenceResult<Vec<Session>> {
            let rows = sqlx::query(r#"
                SELECT id, name, prompt, repo_root, base_branch, branch_name, worktree_path,
                       status, agent_mode, toolbox_path, mcp_servers, runtime_config,
                       benchmark_config, batch_id, metrics, created_at, last_run, timeout_secs
                FROM sessions ORDER BY created_at DESC
            "#)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| PersistenceError::Database(e.to_string()))?;

            let mut sessions = Vec::new();
            for row in rows {
                sessions.push(self.row_to_session(row)?);
            }

            Ok(sessions)
        }

        async fn list_sessions_by_status(&self, status: &crate::domain::SessionStatus) -> PersistenceResult<Vec<Session>> {
            let status_str = match status {
                crate::domain::SessionStatus::Initializing => "initializing",
                crate::domain::SessionStatus::Idle => "idle",
                crate::domain::SessionStatus::Running => "running",
                crate::domain::SessionStatus::AwaitingInput => "awaiting_input",
                crate::domain::SessionStatus::Evaluating => "evaluating",
                crate::domain::SessionStatus::Error(e) => &format!("error:{}", e),
                crate::domain::SessionStatus::Completed => "completed",
            };

            let rows = sqlx::query(r#"
                SELECT id, name, prompt, repo_root, base_branch, branch_name, worktree_path,
                       status, agent_mode, toolbox_path, mcp_servers, runtime_config,
                       benchmark_config, batch_id, metrics, created_at, last_run, timeout_secs
                FROM sessions WHERE status = ? ORDER BY created_at DESC
            "#)
            .bind(status_str)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| PersistenceError::Database(e.to_string()))?;

            let mut sessions = Vec::new();
            for row in rows {
                sessions.push(self.row_to_session(row)?);
            }

            Ok(sessions)
        }

        async fn list_sessions_by_batch(&self, batch_id: &BatchId) -> PersistenceResult<Vec<Session>> {
            let rows = sqlx::query(r#"
                SELECT id, name, prompt, repo_root, base_branch, branch_name, worktree_path,
                       status, agent_mode, toolbox_path, mcp_servers, runtime_config,
                       benchmark_config, batch_id, metrics, created_at, last_run, timeout_secs
                FROM sessions WHERE batch_id = ? ORDER BY created_at DESC
            "#)
            .bind(batch_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| PersistenceError::Database(e.to_string()))?;

            let mut sessions = Vec::new();
            for row in rows {
                sessions.push(self.row_to_session(row)?);
            }

            Ok(sessions)
        }
    }

    impl SqliteStore {
        /// Helper method to convert a SQLite row to a Session
        fn row_to_session(&self, row: sqlx::sqlite::SqliteRow) -> PersistenceResult<Session> {
            use sqlx::Row;

            let status_str: String = row.get("status");
            let status = if status_str.starts_with("error:") {
                crate::domain::SessionStatus::Error(status_str[6..].to_string())
            } else {
                match status_str.as_str() {
                    "initializing" => crate::domain::SessionStatus::Initializing,
                    "idle" => crate::domain::SessionStatus::Idle,
                    "running" => crate::domain::SessionStatus::Running,
                    "awaiting_input" => crate::domain::SessionStatus::AwaitingInput,
                    "evaluating" => crate::domain::SessionStatus::Evaluating,
                    "completed" => crate::domain::SessionStatus::Completed,
                    _ => crate::domain::SessionStatus::Error(format!("Unknown status: {}", status_str)),
                }
            };

            let agent_mode: Option<String> = row.get("agent_mode");
            let agent_mode = agent_mode.map(|am| match am.as_str() {
                "default" => crate::domain::AgentMode::Default,
                "geppetto" => crate::domain::AgentMode::Geppetto,
                "claudetto" => crate::domain::AgentMode::Claudetto,
                "gronk:fast" => crate::domain::AgentMode::GronkFast,
                "bolt" => crate::domain::AgentMode::Bolt,
                custom => crate::domain::AgentMode::Custom(custom.to_string()),
            });

            let mcp_servers: String = row.get("mcp_servers");
            let mcp_servers = serde_json::from_str(&mcp_servers)
                .map_err(|e| PersistenceError::DeserializationError(e.to_string()))?;

            let runtime_config: String = row.get("runtime_config");
            let runtime_config = serde_json::from_str(&runtime_config)
                .map_err(|e| PersistenceError::DeserializationError(e.to_string()))?;

            let benchmark_config: Option<String> = row.get("benchmark_config");
            let benchmark_config = benchmark_config
                .map(|bc| serde_json::from_str(&bc))
                .transpose()
                .map_err(|e| PersistenceError::DeserializationError(e.to_string()))?;

            let metrics: String = row.get("metrics");
            let metrics = serde_json::from_str(&metrics)
                .map_err(|e| PersistenceError::DeserializationError(e.to_string()))?;

            let created_at: String = row.get("created_at");
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_at)
                .map_err(|e| PersistenceError::DeserializationError(e.to_string()))?
                .with_timezone(&chrono::Utc);

            let last_run: Option<String> = row.get("last_run");
            let last_run = last_run
                .map(|lr| chrono::DateTime::parse_from_rfc3339(&lr))
                .transpose()
                .map_err(|e| PersistenceError::DeserializationError(e.to_string()))?
                .map(|dt| dt.with_timezone(&chrono::Utc));

            let timeout_secs: Option<i64> = row.get("timeout_secs");
            let timeout = timeout_secs.map(|secs| std::time::Duration::from_secs(secs as u64));

            Ok(Session {
                id: row.get("id"),
                name: row.get("name"),
                prompt: row.get("prompt"),
                repo_root: std::path::PathBuf::from(row.get::<String, _>("repo_root")),
                base_branch: row.get("base_branch"),
                branch_name: row.get("branch_name"),
                worktree_path: std::path::PathBuf::from(row.get::<String, _>("worktree_path")),
                status,
                agent_mode,
                toolbox_path: row.get::<Option<String>, _>("toolbox_path").map(std::path::PathBuf::from),
                mcp_servers,
                runtime_config,
                benchmark_config,
                batch_id: row.get("batch_id"),
                metrics,
                created_at,
                last_run,
                timeout,
            })
        }
    }

    // For now, provide minimal implementations for BatchStore and BenchmarkStore
    // These can be fully implemented later as needed
    #[async_trait]
    impl BatchStore for SqliteStore {
        async fn create_batch(&self, _batch: &crate::domain::Batch) -> PersistenceResult<()> {
            // TODO: Implement batch persistence
            Err(PersistenceError::NotImplemented("Batch operations not yet implemented".to_string()))
        }

        async fn get_batch(&self, _batch_id: &BatchId) -> PersistenceResult<Option<crate::domain::Batch>> {
            Err(PersistenceError::NotImplemented("Batch operations not yet implemented".to_string()))
        }

        async fn update_batch(&self, _batch: &crate::domain::Batch) -> PersistenceResult<()> {
            Err(PersistenceError::NotImplemented("Batch operations not yet implemented".to_string()))
        }

        async fn delete_batch(&self, _batch_id: &BatchId) -> PersistenceResult<()> {
            Err(PersistenceError::NotImplemented("Batch operations not yet implemented".to_string()))
        }

        async fn list_batches(&self) -> PersistenceResult<Vec<crate::domain::Batch>> {
            Err(PersistenceError::NotImplemented("Batch operations not yet implemented".to_string()))
        }

        async fn list_batches_by_status(&self, _status: &crate::domain::BatchStatus) -> PersistenceResult<Vec<crate::domain::Batch>> {
            Err(PersistenceError::NotImplemented("Batch operations not yet implemented".to_string()))
        }
    }

    #[async_trait]
    impl BenchmarkStore for SqliteStore {
        async fn create_benchmark(&self, _benchmark: &crate::domain::Benchmark) -> PersistenceResult<()> {
            Err(PersistenceError::NotImplemented("Benchmark operations not yet implemented".to_string()))
        }

        async fn get_benchmark(&self, _benchmark_id: &BenchmarkId) -> PersistenceResult<Option<crate::domain::Benchmark>> {
            Err(PersistenceError::NotImplemented("Benchmark operations not yet implemented".to_string()))
        }

        async fn update_benchmark(&self, _benchmark: &crate::domain::Benchmark) -> PersistenceResult<()> {
            Err(PersistenceError::NotImplemented("Benchmark operations not yet implemented".to_string()))
        }

        async fn delete_benchmark(&self, _benchmark_id: &BenchmarkId) -> PersistenceResult<()> {
            Err(PersistenceError::NotImplemented("Benchmark operations not yet implemented".to_string()))
        }

        async fn list_benchmarks(&self) -> PersistenceResult<Vec<crate::domain::Benchmark>> {
            Err(PersistenceError::NotImplemented("Benchmark operations not yet implemented".to_string()))
        }

        async fn list_benchmarks_by_type(&self, _benchmark_type: &crate::domain::BenchmarkType) -> PersistenceResult<Vec<crate::domain::Benchmark>> {
            Err(PersistenceError::NotImplemented("Benchmark operations not yet implemented".to_string()))
        }
    }

    impl Store for SqliteStore {}
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{SessionStatus, BenchmarkType};

    #[tokio::test]
    async fn test_in_memory_session_store() {
        let store = InMemoryStore::new();
        
        // Create a test session
        let session = Session::new(
            "Test Session".to_string(),
            "Test prompt".to_string(),
            "/tmp/test".into(),
            "main".to_string(),
        );
        
        // Test create
        store.create_session(&session).await.unwrap();
        
        // Test get
        let retrieved = store.get_session(&session.id).await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name, "Test Session");
        
        // Test list
        let sessions = store.list_sessions().await.unwrap();
        assert_eq!(sessions.len(), 1);
        
        // Test update
        let mut updated_session = session.clone();
        updated_session.status = SessionStatus::Running;
        store.update_session(&updated_session).await.unwrap();
        
        let retrieved = store.get_session(&session.id).await.unwrap().unwrap();
        assert_eq!(retrieved.status, SessionStatus::Running);
        
        // Test delete
        store.delete_session(&session.id).await.unwrap();
        let retrieved = store.get_session(&session.id).await.unwrap();
        assert!(retrieved.is_none());
    }

    #[tokio::test]
    async fn test_in_memory_batch_store() {
        let store = InMemoryStore::new();
        
        // Create a test batch
        let batch_config = crate::domain::BatchConfig {
            concurrency_limit: 4,
            timeout: std::time::Duration::from_secs(3600),
            retry_policy: crate::domain::RetryPolicy {
                max_attempts: 3,
                backoff_ms: 1000,
                retry_on_failure: true,
            },
            environment: crate::domain::EnvironmentConfig {
                amp_server_url: None,
                amp_cli_path: None,
                agent_modes: vec![],
                toolbox_paths: vec![],
            },
            tasks: vec![],
        };
        
        let batch = Batch::new("Test Batch".to_string(), batch_config);
        
        // Test create
        store.create_batch(&batch).await.unwrap();
        
        // Test get
        let retrieved = store.get_batch(&batch.id).await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name, "Test Batch");
        
        // Test list
        let batches = store.list_batches().await.unwrap();
        assert_eq!(batches.len(), 1);
    }

    #[tokio::test]
    async fn test_in_memory_benchmark_store() {
        let store = InMemoryStore::new();
        
        // Create a test benchmark
        let benchmark = Benchmark::new("Test Benchmark".to_string(), BenchmarkType::Custom);
        
        // Test create
        store.create_benchmark(&benchmark).await.unwrap();
        
        // Test get
        let retrieved = store.get_benchmark(&benchmark.id).await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name, "Test Benchmark");
        
        // Test list
        let benchmarks = store.list_benchmarks().await.unwrap();
        assert_eq!(benchmarks.len(), 1);
    }
}
