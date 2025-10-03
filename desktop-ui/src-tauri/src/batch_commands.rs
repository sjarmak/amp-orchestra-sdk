use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{State, Window, Emitter};
use tokio::sync::RwLock;

use crate::batch_engine::{BatchConfig, BatchEngine, BatchHandle, BatchProgress, RetryPolicy};
use crate::session_manager::EnhancedSessionManager;

// Global state for batch engine
pub struct BatchEngineState {
    pub engine: Arc<BatchEngine>,
    pub active_handles: Arc<RwLock<std::collections::HashMap<String, BatchHandle>>>,
}

// Request/Response types for Tauri commands
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBatchRequest {
    pub name: String,
    pub prompts: Vec<String>,
    pub repositories: Vec<String>, // String paths that will be converted to PathBuf
    pub concurrency: Option<usize>,
    pub timeout_sec: Option<u64>,
    pub retry_policy: Option<RetryPolicyRequest>,
    pub agent_mode: Option<String>,
    pub toolbox_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryPolicyRequest {
    pub max_attempts: u32,
    pub backoff_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBatchResponse {
    pub batch_id: String,
    pub total_sessions: usize,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchProgressResponse {
    pub batch_id: String,
    pub total_sessions: usize,
    pub completed_sessions: usize,
    pub failed_sessions: usize,
    pub running_sessions: usize,
    pub progress_percent: f32,
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelBatchRequest {
    pub batch_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetBatchStatusRequest {
    pub batch_id: String,
}

// Convert internal types to response types
impl From<BatchProgress> for BatchProgressResponse {
    fn from(progress: BatchProgress) -> Self {
        Self {
            batch_id: progress.batch_id,
            total_sessions: progress.total_sessions,
            completed_sessions: progress.completed_sessions,
            failed_sessions: progress.failed_sessions,
            running_sessions: progress.running_sessions,
            progress_percent: progress.progress_percent,
            status: format!("{:?}", progress.status),
        }
    }
}

impl From<StartBatchRequest> for BatchConfig {
    fn from(request: StartBatchRequest) -> Self {
        Self {
            name: request.name,
            prompts: request.prompts,
            repositories: request.repositories.into_iter().map(PathBuf::from).collect(),
            concurrency: request.concurrency.unwrap_or(4),
            timeout_sec: request.timeout_sec.unwrap_or(1800), // 30 minutes default
            retry_policy: request.retry_policy.map(|r| RetryPolicy {
                max_attempts: r.max_attempts,
                backoff_ms: r.backoff_ms,
            }),
            agent_mode: request.agent_mode,
            toolbox_path: request.toolbox_path.map(PathBuf::from),
        }
    }
}

/// Start a new batch execution
#[tauri::command]
pub async fn start_batch(
    request: StartBatchRequest,
    state: State<'_, BatchEngineState>,
    window: Window,
) -> Result<StartBatchResponse, String> {
    let config = BatchConfig::from(request);
    
    match state.engine.start_batch(config).await {
        Ok(mut handle) => {
            let batch_id = handle.batch_id().to_string();
            let total_sessions = handle.total_sessions();
            
            // Start progress monitoring in background
            if let Some(mut progress_rx) = handle.take_progress_receiver() {
                let window_clone = window.clone();
                
                tokio::spawn(async move {
                    while let Some(progress) = progress_rx.recv().await {
                        let progress_response = BatchProgressResponse::from(progress);
                        
                        // Emit progress event to frontend
                        let _ = window_clone.emit("batch_progress", &progress_response);
                        
                        // If batch is completed or failed, break the loop
                        if progress_response.status == "Completed" || 
                           progress_response.status == "Failed" || 
                           progress_response.status == "Cancelled" {
                            let _ = window_clone.emit("batch_completed", &progress_response);
                            break;
                        }
                    }
                });
            }
            
            // Store handle for potential cancellation
            {
                let mut handles = state.active_handles.write().await;
                handles.insert(batch_id.clone(), handle);
            }
            
            Ok(StartBatchResponse {
                batch_id,
                total_sessions,
                status: "Started".to_string(),
            })
        }
        Err(e) => Err(format!("Failed to start batch: {}", e)),
    }
}

/// Cancel a running batch
#[tauri::command]
pub async fn cancel_batch(
    request: CancelBatchRequest,
    state: State<'_, BatchEngineState>,
) -> Result<String, String> {
    match state.engine.cancel_batch(&request.batch_id).await {
        Ok(_) => {
            // Remove from active handles
            {
                let mut handles = state.active_handles.write().await;
                handles.remove(&request.batch_id);
            }
            Ok("Batch cancelled successfully".to_string())
        }
        Err(e) => Err(format!("Failed to cancel batch: {}", e)),
    }
}

/// Get current status of a batch
#[tauri::command]
pub async fn get_batch_status(
    request: GetBatchStatusRequest,
    state: State<'_, BatchEngineState>,
) -> Result<BatchProgressResponse, String> {
    match state.engine.get_batch_status(&request.batch_id).await {
        Ok(progress) => Ok(BatchProgressResponse::from(progress)),
        Err(e) => Err(format!("Failed to get batch status: {}", e)),
    }
}

/// List all active batches
#[tauri::command]
pub async fn list_active_batches(
    state: State<'_, BatchEngineState>,
) -> Result<Vec<BatchProgressResponse>, String> {
    let batches = state.engine.list_active_batches().await;
    Ok(batches.into_iter().map(BatchProgressResponse::from).collect())
}

/// Get batch execution metrics and results
#[tauri::command]
pub async fn get_batch_results(
    request: GetBatchStatusRequest,
    state: State<'_, BatchEngineState>,
) -> Result<BatchResultsResponse, String> {
    // This would typically query the database for detailed results
    // For now, we'll return basic status information
    match state.engine.get_batch_status(&request.batch_id).await {
        Ok(progress) => Ok(BatchResultsResponse {
            batch_id: progress.batch_id,
            total_sessions: progress.total_sessions,
            successful_sessions: progress.completed_sessions,
            failed_sessions: progress.failed_sessions,
            status: format!("{:?}", progress.status),
            session_results: vec![], // TODO: Implement detailed session results
        }),
        Err(e) => Err(format!("Failed to get batch results: {}", e)),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResultsResponse {
    pub batch_id: String,
    pub total_sessions: usize,
    pub successful_sessions: usize,
    pub failed_sessions: usize,
    pub status: String,
    pub session_results: Vec<SessionResultResponse>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResultResponse {
    pub session_id: String,
    pub status: String,
    pub execution_time_ms: Option<u64>,
    pub error_message: Option<String>,
    pub metrics: Option<SessionMetricsResponse>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetricsResponse {
    pub iterations: u32,
    pub tokens_used: u32,
    pub tools_invoked: u32,
    pub execution_time_ms: u64,
}

// Initialize batch engine state for Tauri
pub fn init_batch_engine_state() -> BatchEngineState {
    use crate::runtime_env::{RuntimeEnvironment, EnvKind, AmpConfig, ToolboxConfig};
    
    // Create runtime environment for session manager
    let runtime_env = RuntimeEnvironment {
        env_kind: EnvKind::Production,
        amp_config: AmpConfig {
            server_url: None,
            cli_path: None,
            agent_mode: Some("default".to_string()),
        },
        toolbox_config: ToolboxConfig {
            toolbox_paths: vec![],
            max_file_count: 1000,
            max_total_size: 104857600, // 100MB
        },
        agent_mode: None,
        worktree_path: None,
    };
    
    let session_manager = Arc::new(EnhancedSessionManager::new(Default::default(), runtime_env));
    let batch_engine = Arc::new(BatchEngine::new(session_manager));
    
    BatchEngineState {
        engine: batch_engine,
        active_handles: Arc::new(RwLock::new(std::collections::HashMap::new())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_batch_config_conversion() {
        let request = StartBatchRequest {
            name: "Test Batch".to_string(),
            prompts: vec!["Test prompt".to_string()],
            repositories: vec!["/test/repo".to_string()],
            concurrency: Some(2),
            timeout_sec: Some(600),
            retry_policy: Some(RetryPolicyRequest {
                max_attempts: 3,
                backoff_ms: 1000,
            }),
            agent_mode: Some("geppetto:main".to_string()),
            toolbox_path: Some("/test/toolbox".to_string()),
        };

        let config = BatchConfig::from(request);
        
        assert_eq!(config.name, "Test Batch");
        assert_eq!(config.prompts.len(), 1);
        assert_eq!(config.repositories.len(), 1);
        assert_eq!(config.concurrency, 2);
        assert_eq!(config.timeout_sec, 600);
        assert!(config.retry_policy.is_some());
        assert_eq!(config.agent_mode, Some("geppetto:main".to_string()));
        assert!(config.toolbox_path.is_some());
    }

    #[test]
    fn test_progress_response_conversion() {
        let progress = BatchProgress {
            batch_id: "test-batch".to_string(),
            total_sessions: 10,
            completed_sessions: 5,
            failed_sessions: 1,
            running_sessions: 4,
            progress_percent: 60.0,
            status: crate::batch_engine::BatchStatus::Running,
        };

        let response = BatchProgressResponse::from(progress);
        
        assert_eq!(response.batch_id, "test-batch");
        assert_eq!(response.total_sessions, 10);
        assert_eq!(response.completed_sessions, 5);
        assert_eq!(response.failed_sessions, 1);
        assert_eq!(response.running_sessions, 4);
        assert_eq!(response.progress_percent, 60.0);
        assert_eq!(response.status, "Running");
    }
}
