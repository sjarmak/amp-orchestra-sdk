use std::{collections::HashMap, sync::Arc, time::Duration};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::{
    sync::{mpsc, Mutex, RwLock},
    task::JoinHandle,
    time::{interval, timeout},
};
use tracing::{debug, error, info, warn};

use crate::profile::{ProfileCtx, ProfileError};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStatusEvent {
    pub profile_id: String,
    pub status: ProfileStatus,
    pub connection_info: ConnectionInfo,
    pub error: Option<String>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileStatus {
    Online,
    Offline,
    Error,
    Checking,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub server_url: String,
    pub auth_status: AuthStatus,
    pub cli_available: bool,
    pub last_ping_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthStatus {
    Valid,
    Invalid,
    Expired,
    Unknown,
}

#[derive(Debug)]
struct WorkerHandle {
    task: JoinHandle<()>,
    cancel_tx: mpsc::Sender<()>,
}

pub struct WorkerManager {
    workers: Arc<RwLock<HashMap<String, WorkerHandle>>>,
    app_handle: AppHandle,
}

impl WorkerManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            workers: Arc::new(RwLock::new(HashMap::new())),
            app_handle,
        }
    }

    pub async fn start_worker(&self, ctx: Arc<ProfileCtx>) -> Result<(), ProfileError> {
        let profile_id = ctx.id.clone();
        
        // Stop existing worker if any
        self.stop_worker(&profile_id).await;

        let (cancel_tx, cancel_rx) = mpsc::channel::<()>(1);
        let workers_clone = Arc::clone(&self.workers);
        let app_handle = self.app_handle.clone();
        
        let task = tokio::spawn(async move {
            if let Err(e) = spawn_worker(ctx, cancel_rx, app_handle).await {
                error!("Worker for profile {} failed: {}", profile_id, e);
            }
        });

        let handle = WorkerHandle { task, cancel_tx };
        
        self.workers.write().await.insert(profile_id.clone(), handle);
        info!("Started worker for profile: {}", profile_id);
        
        Ok(())
    }

    pub async fn stop_worker(&self, profile_id: &str) {
        let mut workers = self.workers.write().await;
        
        if let Some(handle) = workers.remove(profile_id) {
            debug!("Stopping worker for profile: {}", profile_id);
            
            // Send cancellation signal
            let _ = handle.cancel_tx.send(()).await;
            
            // Wait for task to complete with timeout
            if let Ok(result) = timeout(Duration::from_secs(5), handle.task).await {
                if let Err(e) = result {
                    warn!("Worker task for profile {} panicked: {}", profile_id, e);
                }
            } else {
                warn!("Worker for profile {} didn't stop gracefully, aborting", profile_id);
                handle.task.abort();
            }
            
            info!("Stopped worker for profile: {}", profile_id);
        }
    }

    pub async fn stop_all_workers(&self) {
        let profile_ids: Vec<String> = self.workers.read().await.keys().cloned().collect();
        
        for profile_id in profile_ids {
            self.stop_worker(&profile_id).await;
        }
    }

    pub async fn get_active_workers(&self) -> Vec<String> {
        self.workers.read().await.keys().cloned().collect()
    }
}

pub async fn spawn_worker(
    ctx: Arc<ProfileCtx>,
    mut cancel_rx: mpsc::Receiver<()>,
    app_handle: AppHandle,
) -> Result<(), ProfileError> {
    let profile_id = ctx.id.clone();
    let mut interval = interval(Duration::from_secs(15));
    
    info!("Health check worker started for profile: {}", profile_id);
    
    // Initial health check
    emit_status_event(&app_handle, &ctx, ProfileStatus::Checking, None).await;
    
    loop {
        tokio::select! {
            _ = cancel_rx.recv() => {
                debug!("Worker for profile {} received cancellation signal", profile_id);
                break;
            }
            _ = interval.tick() => {
                debug!("Running health check for profile: {}", profile_id);
                
                match perform_health_check(&ctx).await {
                    Ok(connection_info) => {
                        let status = if connection_info.auth_status == AuthStatus::Valid && 
                                       connection_info.cli_available {
                            ProfileStatus::Online
                        } else {
                            ProfileStatus::Error
                        };
                        
                        println!("[PROFILE_DEBUG] Profile {} health check succeeded: auth={:?}, cli={}, ping={}ms", 
                                profile_id, connection_info.auth_status, connection_info.cli_available,
                                connection_info.last_ping_ms.unwrap_or(0));
                        
                        emit_status_event_with_info(&app_handle, &ctx, status, connection_info, None).await;
                    }
                    Err(e) => {
                        println!("[PROFILE_DEBUG] Profile {} health check failed: {}", profile_id, e);
                        warn!("Health check failed for profile {}: {}", profile_id, e);
                        let connection_info = ConnectionInfo {
                            server_url: ctx.config.amp_url.clone(),
                            auth_status: AuthStatus::Unknown,
                            cli_available: false,
                            last_ping_ms: None,
                        };
                        emit_status_event_with_info(
                            &app_handle, 
                            &ctx, 
                            ProfileStatus::Offline, 
                            connection_info,
                            Some(e.to_string())
                        ).await;
                    }
                }
            }
        }
    }
    
    info!("Health check worker stopped for profile: {}", profile_id);
    Ok(())
}

async fn perform_health_check(ctx: &ProfileCtx) -> Result<ConnectionInfo, ProfileError> {
    let start_time = std::time::Instant::now();
    
    // Check CLI availability first
    let cli_available = cli_health_check(ctx).await?;
    
    // Check API connectivity
    let ping_result = amp_ping(ctx).await;
    let ping_ms = match ping_result {
        Ok(_) => Some(start_time.elapsed().as_millis() as u64),
        Err(_) => None,
    };
    
    // Check authentication status
    let auth_status = auth_health_check(ctx).await?;
    
    Ok(ConnectionInfo {
        server_url: ctx.config.amp_url.clone(),
        auth_status,
        cli_available,
        last_ping_ms: ping_ms,
    })
}

async fn amp_ping(ctx: &ProfileCtx) -> Result<(), ProfileError> {
    let timeout_duration = Duration::from_secs(30);
    
    let client = reqwest::Client::builder()
        .timeout(timeout_duration)
        .build()
        .map_err(|e| ProfileError::Network(format!("Failed to create HTTP client: {}", e)))?;
    
    let ping_url = format!("{}/api/health", ctx.config.amp_url);
    
    let response = timeout(timeout_duration, client.get(&ping_url).send()).await
        .map_err(|_| ProfileError::Network("Request timeout".to_string()))?
        .map_err(|e| ProfileError::Network(format!("Request failed: {}", e)))?;
    
    if response.status().is_success() {
        debug!("Ping successful for profile: {}", ctx.id);
        Ok(())
    } else {
        Err(ProfileError::Network(format!(
            "Ping failed with status: {}", 
            response.status()
        )))
    }
}

async fn cli_health_check(ctx: &ProfileCtx) -> Result<bool, ProfileError> {
    let cli_path = ctx.config.amp_cli_path.as_deref().unwrap_or("amp");
    
    println!("[PROFILE_DEBUG] CLI health check for profile {}: using path '{}'", ctx.id, cli_path);
    
    let output = timeout(
        Duration::from_secs(5),
        tokio::process::Command::new(cli_path)
            .arg("--version")
            .output()
    ).await
    .map_err(|_| {
        println!("[PROFILE_DEBUG] CLI health check timeout for profile {}", ctx.id);
        ProfileError::Cli("CLI health check timeout".to_string())
    })?
    .map_err(|e| {
        println!("[PROFILE_DEBUG] CLI not available for profile {}: {}", ctx.id, e);
        ProfileError::Cli(format!("CLI not available: {}", e))
    })?;
    
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        println!("[PROFILE_DEBUG] CLI health check passed for profile {}: {}", ctx.id, stdout.trim());
        debug!("CLI health check passed for profile: {}", ctx.id);
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("[PROFILE_DEBUG] CLI health check failed for profile {}: {}", ctx.id, stderr);
        Err(ProfileError::Cli(format!("CLI health check failed: {}", stderr)))
    }
}

async fn auth_health_check(ctx: &ProfileCtx) -> Result<AuthStatus, ProfileError> {
    // First check if we have a token
    if ctx.config.amp_token.is_none() {
        println!("[PROFILE_DEBUG] Auth health check for profile {}: no token provided, returning Unknown", ctx.id);
        return Ok(AuthStatus::Unknown);
    }
    
    println!("[PROFILE_DEBUG] Auth health check for profile {}: testing token against {}", ctx.id, ctx.config.amp_url);
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| {
            println!("[PROFILE_DEBUG] Failed to create HTTP client for profile {}: {}", ctx.id, e);
            ProfileError::Network(format!("Failed to create HTTP client: {}", e))
        })?;
    
    let auth_url = format!("{}/api/user", ctx.config.amp_url);
    let mut request = client.get(&auth_url);
    
    if let Some(token) = &ctx.config.amp_token {
        request = request.bearer_auth(token);
    }
    
    match timeout(Duration::from_secs(30), request.send()).await {
        Ok(Ok(response)) => {
            let status_code = response.status().as_u16();
            println!("[PROFILE_DEBUG] Auth response for profile {}: status {}", ctx.id, status_code);
            match status_code {
                200 => Ok(AuthStatus::Valid),
                401 => Ok(AuthStatus::Invalid),
                403 => Ok(AuthStatus::Expired),
                _ => Ok(AuthStatus::Unknown),
            }
        }
        Ok(Err(e)) => {
            println!("[PROFILE_DEBUG] Auth request failed for profile {}: {}", ctx.id, e);
            Ok(AuthStatus::Unknown)
        },
        Err(_) => {
            println!("[PROFILE_DEBUG] Auth request timeout for profile {}", ctx.id);
            Ok(AuthStatus::Unknown) // Timeout
        }
    }
}

async fn emit_status_event(
    app_handle: &AppHandle,
    ctx: &ProfileCtx,
    status: ProfileStatus,
    error: Option<String>,
) {
    let connection_info = ConnectionInfo {
        server_url: ctx.config.amp_url.clone(),
        auth_status: AuthStatus::Unknown,
        cli_available: false,
        last_ping_ms: None,
    };
    
    emit_status_event_with_info(app_handle, ctx, status, connection_info, error).await;
}

async fn emit_status_event_with_info(
    app_handle: &AppHandle,
    ctx: &ProfileCtx,
    status: ProfileStatus,
    connection_info: ConnectionInfo,
    error: Option<String>,
) {
    let event = ProfileStatusEvent {
        profile_id: ctx.id.clone(),
        status,
        connection_info,
        error,
        timestamp: chrono::Utc::now().timestamp_millis(),
    };
    
    if let Err(e) = app_handle.emit_all("profile-status", &event) {
        error!("Failed to emit profile status event: {}", e);
    }
}

impl Drop for WorkerManager {
    fn drop(&mut self) {
        let workers = Arc::clone(&self.workers);
        tokio::spawn(async move {
            let profile_ids: Vec<String> = workers.read().await.keys().cloned().collect();
            
            for (_, handle) in workers.write().await.drain() {
                let _ = handle.cancel_tx.send(()).await;
                handle.task.abort();
            }
        });
    }
}
