use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, RwLock};
use tokio::time::Instant;
use uuid::Uuid;
use unified_core::domain::AgentMode;

use crate::session_manager::EnhancedSessionManager;

pub type BatchId = String;
pub type SessionId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchConfig {
    pub name: String,
    pub prompts: Vec<String>,
    pub repositories: Vec<PathBuf>,
    pub concurrency: usize,
    pub timeout_sec: u64,
    pub retry_policy: Option<RetryPolicy>,
    pub agent_mode: Option<String>,
    pub toolbox_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub backoff_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchProgress {
    pub batch_id: BatchId,
    pub total_sessions: usize,
    pub completed_sessions: usize,
    pub failed_sessions: usize,
    pub running_sessions: usize,
    pub progress_percent: f32,
    pub status: BatchStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BatchStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    pub batch_id: BatchId,
    pub total_sessions: usize,
    pub successful_sessions: usize,
    pub failed_sessions: usize,
    pub execution_time: Duration,
    pub session_results: Vec<BatchSessionResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchSessionResult {
    pub session_id: SessionId,
    pub status: SessionStatus,
    #[serde(skip)] // Skip serialization for now, use creation timestamps if needed
    pub start_time: Option<Instant>,
    #[serde(skip)] // Skip serialization for now
    pub end_time: Option<Instant>,
    pub error_message: Option<String>,
    pub metrics: Option<SessionMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMetrics {
    pub iterations: u32,
    pub tokens_used: u32,
    pub tools_invoked: u32,
    pub execution_time_ms: u64,
}

#[derive(Debug)]
pub struct BatchExecution {
    pub id: BatchId,
    pub config: BatchConfig,
    pub status: BatchStatus,
    pub sessions: HashMap<SessionId, BatchSessionResult>,
    pub start_time: Option<Instant>,
    pub progress_tx: mpsc::UnboundedSender<BatchProgress>,
}

pub struct BatchEngine {
    session_manager: Arc<EnhancedSessionManager>,
    active_batches: Arc<RwLock<HashMap<BatchId, BatchExecution>>>,
    concurrency_limit: usize,
}

impl BatchEngine {
    pub fn new(session_manager: Arc<EnhancedSessionManager>) -> Self {
        Self {
            session_manager,
            active_batches: Arc::new(RwLock::new(HashMap::new())),
            concurrency_limit: 8, // Default concurrency limit
        }
    }

    pub async fn start_batch(&self, config: BatchConfig) -> Result<BatchHandle, BatchError> {
        let batch_id = Uuid::new_v4().to_string();
        
        // Validate configuration
        if config.prompts.is_empty() {
            return Err(BatchError::InvalidConfig("No prompts provided".to_string()));
        }
        
        if config.repositories.is_empty() {
            return Err(BatchError::InvalidConfig("No repositories provided".to_string()));
        }

        // Create progress channel
        let (progress_tx, progress_rx) = mpsc::unbounded_channel();
        
        // Calculate total sessions (prompts × repositories)
        let total_sessions = config.prompts.len() * config.repositories.len();
        
        // Create batch execution
        let batch_execution = BatchExecution {
            id: batch_id.clone(),
            config: config.clone(),
            status: BatchStatus::Pending,
            sessions: HashMap::new(),
            start_time: None,
            progress_tx: progress_tx.clone(),
        };

        // Store batch execution
        {
            let mut batches = self.active_batches.write().await;
            batches.insert(batch_id.clone(), batch_execution);
        }

        // Create batch handle
        let handle = BatchHandle {
            batch_id: batch_id.clone(),
            progress_rx: Some(progress_rx),
            total_sessions,
        };

        // Start batch execution in background
        let engine = self.clone();
        tokio::spawn(async move {
            if let Err(e) = engine.execute_batch_internal(batch_id).await {
                eprintln!("Batch execution failed: {:?}", e);
            }
        });

        Ok(handle)
    }

    async fn execute_batch_internal(&self, batch_id: BatchId) -> Result<(), BatchError> {
        // Get batch configuration
        let config = {
            let batches = self.active_batches.read().await;
            match batches.get(&batch_id) {
                Some(batch) => batch.config.clone(),
                None => return Err(BatchError::BatchNotFound(batch_id)),
            }
        };

        // Update status to running
        {
            let mut batches = self.active_batches.write().await;
            if let Some(batch) = batches.get_mut(&batch_id) {
                batch.status = BatchStatus::Running;
                batch.start_time = Some(Instant::now());
            }
        }

        let mut session_handles = Vec::new();
        let semaphore = Arc::new(tokio::sync::Semaphore::new(config.concurrency.min(self.concurrency_limit)));

        // Create sessions for each prompt/repository combination
        for prompt in &config.prompts {
            for repository in &config.repositories {
                let session_id = Uuid::new_v4().to_string();
                
                // Create session using the enhanced session manager
                let agent_mode = config.agent_mode.as_ref().map(|mode| {
                    // Convert string to AgentMode enum
                    match mode.as_str() {
                        "geppetto:main" => AgentMode::Geppetto,
                        "default" => AgentMode::Default,
                        _ => AgentMode::Custom(mode.clone()),
                    }
                });

                // Create session
                match self.session_manager.create_session(
                    format!("Batch_{}_Session", batch_id),
                    prompt.clone(),
                    repository.clone(),
                    "main".to_string(),
                    agent_mode,
                ).await {
                    Ok(_) => {
                        // Track session in batch
                        {
                            let mut batches = self.active_batches.write().await;
                            if let Some(batch) = batches.get_mut(&batch_id) {
                                batch.sessions.insert(session_id.clone(), BatchSessionResult {
                                    session_id: session_id.clone(),
                                    status: SessionStatus::Pending,
                                    start_time: None,
                                    end_time: None,
                                    error_message: None,
                                    metrics: None,
                                });
                            }
                        }

                        // Create session execution task
                        let permit = semaphore.clone().acquire_owned().await.unwrap();
                        let batch_id_clone = batch_id.clone();
                        let session_id_clone = session_id.clone();
                        let session_manager = self.session_manager.clone();
                        let active_batches = self.active_batches.clone();

                        let handle = tokio::spawn(async move {
                            let _permit = permit; // Hold permit until task completes
                            
                            let start_time = Instant::now();
                            
                            // Update session status to running
                            {
                                let mut batches = active_batches.write().await;
                                if let Some(batch) = batches.get_mut(&batch_id_clone) {
                                    if let Some(session) = batch.sessions.get_mut(&session_id_clone) {
                                        session.status = SessionStatus::Running;
                                        session.start_time = Some(start_time);
                                    }
                                }
                            }

                            // Execute session
                            let result = session_manager.start_session(&session_id_clone).await;
                            let end_time = Instant::now();

                            // Update session result
                            {
                                let mut batches = active_batches.write().await;
                                if let Some(batch) = batches.get_mut(&batch_id_clone) {
                                    if let Some(session) = batch.sessions.get_mut(&session_id_clone) {
                                        session.end_time = Some(end_time);
                                        match &result {
                                            Ok(_) => session.status = SessionStatus::Completed,
                                            Err(e) => {
                                                session.status = SessionStatus::Failed;
                                                session.error_message = Some(e.to_string());
                                            }
                                        }
                                    }
                                    
                                    // Send progress update
                                    let progress = Self::calculate_progress(&batch_id_clone, batch);
                                    let _ = batch.progress_tx.send(progress);
                                }
                            }

                            (session_id_clone, result)
                        });

                        session_handles.push(handle);
                    }
                    Err(e) => {
                        // Track failed session creation
                        let mut batches = self.active_batches.write().await;
                        if let Some(batch) = batches.get_mut(&batch_id) {
                            batch.sessions.insert(session_id.clone(), BatchSessionResult {
                                session_id: session_id.clone(),
                                status: SessionStatus::Failed,
                                start_time: None,
                                end_time: None,
                                error_message: Some(format!("Failed to create session: {}", e)),
                                metrics: None,
                            });
                        }
                    }
                }
            }
        }

        // Wait for all sessions to complete
        for handle in session_handles {
            let _ = handle.await;
        }

        // Update final batch status
        {
            let mut batches = self.active_batches.write().await;
            if let Some(batch) = batches.get_mut(&batch_id) {
                let failed_count = batch.sessions.values()
                    .filter(|s| matches!(s.status, SessionStatus::Failed))
                    .count();
                
                batch.status = if failed_count == 0 {
                    BatchStatus::Completed
                } else {
                    BatchStatus::Failed
                };

                // Send final progress update
                let progress = Self::calculate_progress(&batch_id, batch);
                let _ = batch.progress_tx.send(progress);
            }
        }

        Ok(())
    }

    fn calculate_progress(batch_id: &str, batch: &BatchExecution) -> BatchProgress {
        let total_sessions = batch.sessions.len();
        let completed_sessions = batch.sessions.values()
            .filter(|s| matches!(s.status, SessionStatus::Completed))
            .count();
        let failed_sessions = batch.sessions.values()
            .filter(|s| matches!(s.status, SessionStatus::Failed))
            .count();
        let running_sessions = batch.sessions.values()
            .filter(|s| matches!(s.status, SessionStatus::Running))
            .count();

        let progress_percent = if total_sessions > 0 {
            ((completed_sessions + failed_sessions) as f32 / total_sessions as f32) * 100.0
        } else {
            0.0
        };

        BatchProgress {
            batch_id: batch_id.to_string(),
            total_sessions,
            completed_sessions,
            failed_sessions,
            running_sessions,
            progress_percent,
            status: batch.status.clone(),
        }
    }

    pub async fn cancel_batch(&self, batch_id: &str) -> Result<(), BatchError> {
        let mut batches = self.active_batches.write().await;
        
        if let Some(batch) = batches.get_mut(batch_id) {
            batch.status = BatchStatus::Cancelled;
            
            // Send cancellation progress update
            let progress = Self::calculate_progress(batch_id, batch);
            let _ = batch.progress_tx.send(progress);
            
            Ok(())
        } else {
            Err(BatchError::BatchNotFound(batch_id.to_string()))
        }
    }

    pub async fn get_batch_status(&self, batch_id: &str) -> Result<BatchProgress, BatchError> {
        let batches = self.active_batches.read().await;
        
        if let Some(batch) = batches.get(batch_id) {
            Ok(Self::calculate_progress(batch_id, batch))
        } else {
            Err(BatchError::BatchNotFound(batch_id.to_string()))
        }
    }

    pub async fn list_active_batches(&self) -> Vec<BatchProgress> {
        let batches = self.active_batches.read().await;
        batches.iter()
            .map(|(batch_id, batch)| Self::calculate_progress(batch_id, batch))
            .collect()
    }
}

// Clone implementation for BatchEngine
impl Clone for BatchEngine {
    fn clone(&self) -> Self {
        Self {
            session_manager: self.session_manager.clone(),
            active_batches: self.active_batches.clone(),
            concurrency_limit: self.concurrency_limit,
        }
    }
}

pub struct BatchHandle {
    pub batch_id: BatchId,
    pub progress_rx: Option<mpsc::UnboundedReceiver<BatchProgress>>,
    pub total_sessions: usize,
}

impl BatchHandle {
    pub fn batch_id(&self) -> &str {
        &self.batch_id
    }

    pub fn total_sessions(&self) -> usize {
        self.total_sessions
    }

    pub fn take_progress_receiver(&mut self) -> Option<mpsc::UnboundedReceiver<BatchProgress>> {
        self.progress_rx.take()
    }
}

#[derive(Debug)]
pub enum BatchError {
    InvalidConfig(String),
    BatchNotFound(String),
    SessionError(SessionErrorWrapper),
    DatabaseError(String),
}

#[derive(Debug)]
pub struct SessionErrorWrapper(pub String);

impl std::fmt::Display for BatchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BatchError::InvalidConfig(msg) => write!(f, "Invalid batch configuration: {}", msg),
            BatchError::BatchNotFound(id) => write!(f, "Batch not found: {}", id),
            BatchError::SessionError(err) => write!(f, "Session management error: {}", err.0),
            BatchError::DatabaseError(msg) => write!(f, "Database error: {}", msg),
        }
    }
}

impl std::error::Error for BatchError {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[tokio::test]
    async fn test_batch_config_validation() {
        // Test empty prompts
        let config = BatchConfig {
            name: "Test Batch".to_string(),
            prompts: vec![],
            repositories: vec![PathBuf::from("/test/repo")],
            concurrency: 1,
            timeout_sec: 300,
            retry_policy: None,
            agent_mode: None,
            toolbox_path: None,
        };

        // Mock session manager
        let session_manager = Arc::new(
            EnhancedSessionManager::new(Default::default())
        );
        let batch_engine = BatchEngine::new(session_manager);

        let result = batch_engine.start_batch(config).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), BatchError::InvalidConfig(_)));
    }

    #[tokio::test]
    async fn test_batch_progress_calculation() {
        let batch_execution = BatchExecution {
            id: "test".to_string(),
            config: BatchConfig {
                name: "Test".to_string(),
                prompts: vec!["test".to_string()],
                repositories: vec![PathBuf::from("/test")],
                concurrency: 1,
                timeout_sec: 300,
                retry_policy: None,
                agent_mode: None,
                toolbox_path: None,
            },
            status: BatchStatus::Running,
            sessions: {
                let mut sessions = HashMap::new();
                sessions.insert("session1".to_string(), BatchSessionResult {
                    session_id: "session1".to_string(),
                    status: SessionStatus::Completed,
                    start_time: None,
                    end_time: None,
                    error_message: None,
                    metrics: None,
                });
                sessions.insert("session2".to_string(), BatchSessionResult {
                    session_id: "session2".to_string(),
                    status: SessionStatus::Running,
                    start_time: None,
                    end_time: None,
                    error_message: None,
                    metrics: None,
                });
                sessions
            },
            start_time: Some(Instant::now()),
            progress_tx: mpsc::unbounded_channel().0,
        };

        let progress = BatchEngine::calculate_progress("test", &batch_execution);
        
        assert_eq!(progress.total_sessions, 2);
        assert_eq!(progress.completed_sessions, 1);
        assert_eq!(progress.running_sessions, 1);
        assert_eq!(progress.progress_percent, 50.0);
    }
}
