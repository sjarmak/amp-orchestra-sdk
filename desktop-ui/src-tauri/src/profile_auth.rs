use std::collections::HashMap;
use std::sync::Arc;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use chrono::Utc;
use sqlx::sqlite::SqlitePool;

use crate::amp_auth::{ensure_auth, AuthStatus, ResolvedConfig};
use crate::keychain_auth::{KeychainAuth, TokenType};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProfileRow {
    pub id: String,
    pub name: String,
    pub api_url: String,
    pub cli_path: Option<String>,
    pub tls_insecure: bool,
    pub db_namespace: Option<String>,
    pub last_used_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct ProfileCtx {
    pub profile: ProfileRow,
    #[allow(dead_code)]
    pub http_client: reqwest::Client,
    pub env_vars: HashMap<String, String>,
    pub cancellation_token: CancellationToken,
}

impl ProfileCtx {
    pub fn new(profile: ProfileRow) -> Self {
        let mut env_vars: HashMap<String, String> = std::env::vars().collect();
        
        // Set up environment variables based on profile
        env_vars.insert("AMP_URL".to_string(), profile.api_url.clone());
        
        if let Some(cli_path) = &profile.cli_path {
            if cli_path == "amp" {
                // Use system binary
                env_vars.insert("AMP_BIN".to_string(), "amp".to_string());
                env_vars.remove("AMP_CLI_PATH");
            } else {
                // Use custom CLI path
                env_vars.insert("AMP_CLI_PATH".to_string(), cli_path.clone());
                env_vars.remove("AMP_BIN");
            }
        }
        
        if profile.tls_insecure {
            env_vars.insert("NODE_TLS_REJECT_UNAUTHORIZED".to_string(), "0".to_string());
        }
        
        if let Some(namespace) = &profile.db_namespace {
            env_vars.insert("AMP_DB_NAMESPACE".to_string(), namespace.clone());
        }
        
        let http_client = reqwest::Client::builder()
            .danger_accept_invalid_certs(profile.tls_insecure)
            .build()
            .unwrap_or_default();
        
        Self {
            profile,
            http_client,
            env_vars,
            cancellation_token: CancellationToken::new(),
        }
    }
    
    pub fn to_resolved_config(&self) -> ResolvedConfig {
        ResolvedConfig::from_env_with_overrides(self.env_vars.clone())
    }
}

pub struct ProfileManager {
    pub profiles: DashMap<String, Arc<RwLock<ProfileCtx>>>,
    pub active_profile_id: Arc<RwLock<Option<String>>>,
    pub app_handle: AppHandle,
    pub db_pool: Arc<RwLock<Option<SqlitePool>>>,
}

impl ProfileManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            profiles: DashMap::new(),
            active_profile_id: Arc::new(RwLock::new(None)),
            app_handle,
            db_pool: Arc::new(RwLock::new(None)),
        }
    }
    

    
    pub async fn initialize_db(&self) -> Result<(), String> {
        log::debug!("initialize_db: Starting database initialization");
        
        // Create database directory
        log::debug!("initialize_db: Resolving app data directory");
        let app_data_dir = self.app_handle.path()
            .app_data_dir()
            .map_err(|e| {
                log::error!("initialize_db: Failed to resolve app data directory: {}", e);
                format!("Failed to resolve app data directory: {}", e)
            })?;
        
        log::debug!("initialize_db: App data directory: {:?}", app_data_dir);
        
        // Ensure parent directory exists with proper permissions
        if let Some(parent) = app_data_dir.parent() {
            if !parent.exists() {
                log::debug!("initialize_db: Creating parent directory: {:?}", parent);
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| {
                        log::error!("initialize_db: Failed to create parent directory: {}", e);
                        format!("Failed to create parent directory {}: {}", parent.display(), e)
                    })?;
            }
        }
        
        // Create app data directory with proper error handling
        if !app_data_dir.exists() {
            log::debug!("initialize_db: Creating app data directory");
            tokio::fs::create_dir_all(&app_data_dir)
                .await
                .map_err(|e| {
                    log::error!("initialize_db: Failed to create app data directory: {}", e);
                    format!("Failed to create app data directory {}: {}", app_data_dir.display(), e)
                })?;
        }
        
        // Verify directory is writable
        let test_file = app_data_dir.join(".write_test");
        tokio::fs::write(&test_file, "test")
            .await
            .map_err(|e| {
                log::error!("initialize_db: Directory is not writable: {}", e);
                format!("App data directory {} is not writable: {}", app_data_dir.display(), e)
            })?;
        let _ = tokio::fs::remove_file(&test_file).await; // Clean up test file
        
        let db_path = app_data_dir.join("app.db");
        
        // Check if database file exists and is accessible
        if db_path.exists() {
            log::debug!("initialize_db: Database file exists, checking accessibility");
            match tokio::fs::metadata(&db_path).await {
                Ok(metadata) => {
                    log::debug!("initialize_db: Database file size: {} bytes", metadata.len());
                    if metadata.len() == 0 {
                        log::warn!("initialize_db: Database file is empty, will be recreated");
                        let _ = tokio::fs::remove_file(&db_path).await;
                    }
                },
                Err(e) => {
                    log::warn!("initialize_db: Cannot access existing database file: {}", e);
                    let _ = tokio::fs::remove_file(&db_path).await;
                }
            }
        }
        
        let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());
        log::debug!("initialize_db: Database URL: {}", db_url);
        
        // Create connection pool with retry logic
        log::debug!("initialize_db: Creating SQLite connection pool");
        let mut last_error = None;
        let mut pool = None;
        
        for attempt in 1..=3 {
            log::debug!("initialize_db: Connection attempt {}/3", attempt);
            match SqlitePool::connect(&db_url).await {
                Ok(p) => {
                    pool = Some(p);
                    break;
                },
                Err(e) => {
                    log::warn!("initialize_db: Connection attempt {} failed: {}", attempt, e);
                    last_error = Some(e);
                    if attempt < 3 {
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    }
                }
            }
        }
        
        let pool = pool.ok_or_else(|| {
            let error_msg = match last_error {
                Some(e) => format!("Failed to connect to database after 3 attempts: {}", e),
                None => "Failed to connect to database after 3 attempts".to_string(),
            };
            log::error!("initialize_db: {}", error_msg);
            error_msg
        })?;
        
        log::debug!("initialize_db: Connected to database successfully");
        
        // Test connection with a simple query
        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| {
                log::error!("initialize_db: Database connection test failed: {}", e);
                format!("Database connection test failed: {}", e)
            })?;
        
        log::debug!("initialize_db: Database connection test successful");
        
        // Run migrations manually since we can't use sqlx::migrate! with tauri
        log::debug!("initialize_db: Running database migrations");
        
        let migrations = vec![
            ("001_initial.sql", include_str!("../migrations/001_initial.sql")),
            ("002_chat_sessions.sql", include_str!("../migrations/002_chat_sessions.sql")),
            ("003_chat_sessions_agent_mode.sql", include_str!("../migrations/003_chat_sessions_agent_mode.sql")),
            ("004_add_toolbox_profiles.sql", include_str!("../migrations/004_add_toolbox_profiles.sql")),
            ("005_add_worktrees_support.sql", include_str!("../migrations/005_add_worktrees_support.sql")),
            ("006_batch_processing.sql", include_str!("../migrations/006_batch_processing.sql")),
            ("007_add_threads_architecture.sql", include_str!("../migrations/007_add_threads_architecture.sql")),
        ];
        
        for (name, migration_sql) in migrations {
            log::debug!("initialize_db: Running migration {}, SQL length: {} characters", name, migration_sql.len());
            
            // Execute migration with better error handling
            match sqlx::query(migration_sql).execute(&pool).await {
                Ok(result) => {
                    log::debug!("initialize_db: Migration {} executed successfully, rows affected: {}", name, result.rows_affected());
                },
                Err(e) => {
                    // Check if error is due to tables already existing (not a critical error)
                    let error_str = e.to_string();
                    if error_str.contains("already exists") || error_str.contains("duplicate column name") {
                        log::debug!("initialize_db: Migration {} - tables already exist, skipping", name);
                    } else {
                        log::error!("initialize_db: Failed to run migration {}: {}", name, e);
                        return Err(format!("Failed to run migration {}: {}", name, e));
                    }
                }
            }
        }
        
        log::debug!("initialize_db: Migrations completed successfully");
        
        // Store the pool
        *self.db_pool.write().await = Some(pool);
        log::info!("initialize_db: Database initialization completed successfully");
        Ok(())
    }
    
    pub async fn load_profiles(&self) -> Result<(), String> {
        let db_pool_guard = self.db_pool.read().await;
        let db = db_pool_guard
            .as_ref()
            .ok_or("Database not initialized. Profiles cannot be loaded from storage.")?;
        
        // Load all profiles from database
        let profiles = sqlx::query_as::<_, ProfileRow>("SELECT * FROM profiles ORDER BY name")
            .fetch_all(db)
            .await
            .map_err(|e| format!("Failed to load profiles: {}", e))?;
        
        // Clear existing profiles
        self.profiles.clear();
        
        // Load profiles into memory
        for profile_row in profiles {
            let profile_ctx = Arc::new(RwLock::new(ProfileCtx::new(profile_row.clone())));
            self.profiles.insert(profile_row.id.clone(), profile_ctx);
        }
        
        // Load active profile ID
        let active_result = sqlx::query_scalar::<_, String>(
            "SELECT value FROM ui_state WHERE key = 'active_profile_id'"
        )
        .fetch_optional(db)
        .await
        .map_err(|e| format!("Failed to load active profile: {}", e))?;
        
        if let Some(active_id) = active_result {
            *self.active_profile_id.write().await = Some(active_id);
        }
        
        Ok(())
    }
    
    pub async fn activate_profile(&self, profile_id: String) -> Result<(), String> {
        // Check if profile exists
        if !self.profiles.contains_key(&profile_id) {
            return Err(format!("Profile '{}' not found", profile_id));
        }
        
        // Deactivate current profile
        self.deactivate_current().await?;
        
        // Load tokens from keychain and update profile context
        let tokens = self.load_profile_tokens(&profile_id).await?;
        if let Some(profile_entry) = self.profiles.get(&profile_id) {
            let mut profile_ctx = profile_entry.write().await;
            // Apply loaded tokens to environment variables
            for (key, value) in tokens {
                profile_ctx.env_vars.insert(key, value);
            }
        }
        
        // Set new active profile
        *self.active_profile_id.write().await = Some(profile_id.clone());
        
        // Update database
        let db_pool_guard = self.db_pool.read().await;
        let db = db_pool_guard
            .as_ref()
            .ok_or("Database not initialized")?;
        
        sqlx::query("INSERT OR REPLACE INTO ui_state (key, value) VALUES ('active_profile_id', ?)")
            .bind(&profile_id)
            .execute(db)
            .await
            .map_err(|e| format!("Failed to update active profile: {}", e))?;
        
        // Update last_used_at for the profile
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE profiles SET last_used_at = ? WHERE id = ?")
            .bind(&now)
            .bind(&profile_id)
            .execute(db)
            .await
            .map_err(|e| format!("Failed to update profile last_used_at: {}", e))?;
        
        Ok(())
    }
    
    pub async fn deactivate_current(&self) -> Result<(), String> {
        let current_id = self.active_profile_id.read().await.clone();
        
        if let Some(profile_id) = current_id {
            // Cancel any ongoing operations for this profile
            if let Some(profile_entry) = self.profiles.get(&profile_id) {
                let profile_ctx = profile_entry.read().await;
                profile_ctx.cancellation_token.cancel();
            }
        }
        
        *self.active_profile_id.write().await = None;
        Ok(())
    }
    
    pub async fn get_active_profile(&self) -> Option<Arc<RwLock<ProfileCtx>>> {
        let active_id = self.active_profile_id.read().await.clone()?;
        self.profiles.get(&active_id).map(|entry| entry.clone())
    }
    
    pub fn get_all_profiles(&self) -> Vec<(String, Arc<RwLock<ProfileCtx>>)> {
        self.profiles
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().clone()))
            .collect()
    }

    /// Load tokens from keychain for profile and apply to environment
    pub async fn load_profile_tokens(&self, profile_id: &str) -> Result<HashMap<String, String>, String> {
        let keychain = KeychainAuth::new();
        let mut env_vars = HashMap::new();

        // Try to load each token type
        if let Ok(token) = keychain.get_token(profile_id, &TokenType::AccessToken) {
            env_vars.insert("AMP_TOKEN".to_string(), token);
        } else if let Ok(token) = keychain.get_token(profile_id, &TokenType::RefreshToken) {
            env_vars.insert("AMP_REFRESH_TOKEN".to_string(), token);
        } else if let Ok(token) = keychain.get_token(profile_id, &TokenType::ApiKey) {
            env_vars.insert("AMP_API_KEY".to_string(), token);
        }

        log::debug!("Loaded {} tokens from keychain for profile {}", env_vars.len(), profile_id);
        Ok(env_vars)
    }

    /// Store auth credentials in keychain after successful authentication
    pub async fn store_auth_credentials(&self, profile_id: &str, credentials: &LoginCredentials) -> Result<(), String> {
        let keychain = KeychainAuth::new();

        // Store token if provided
        if let Some(ref token) = credentials.token {
            keychain.store_token(profile_id, TokenType::AccessToken, token)
                .map_err(|e| format!("Failed to store access token: {}", e))?;
            log::debug!("Stored access token for profile {}", profile_id);
        }

        Ok(())
    }

    /// Clear tokens from keychain on logout
    pub async fn clear_profile_auth(&self, profile_id: &str) -> Result<(), String> {
        let keychain = KeychainAuth::new();
        keychain.clear_profile_tokens(profile_id)
            .map_err(|e| format!("Failed to clear profile tokens: {}", e))?;
        
        log::debug!("Cleared auth tokens for profile {}", profile_id);
        Ok(())
    }
}

#[derive(Debug, Serialize)]
pub struct ProfileInfo {
    pub id: String,
    pub name: String,
    pub api_url: String,
    pub cli_path: Option<String>,
    pub tls_insecure: bool,
    pub db_namespace: Option<String>,
    pub last_used_at: Option<String>,
    pub is_active: bool,
    pub has_stored_tokens: bool,
}

#[derive(Debug, Deserialize)]
pub struct LoginCredentials {
    pub email: Option<String>,
    pub password: Option<String>,
    pub token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProfileRequest {
    pub name: String,
    pub connection_type: String, // "production" | "local-server" | "local-cli"
    pub api_url: Option<String>,
    pub cli_path: Option<String>,
    pub token: Option<String>,
    pub tls_enabled: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct AmpProfile {
    pub id: String,
    pub name: String,
    pub connection_type: String,
    pub api_url: Option<String>,
    pub cli_path: Option<String>,
    pub token: Option<String>,
    pub tls_enabled: Option<bool>,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl ProfileRow {
    fn to_amp_profile(&self, is_active: bool) -> AmpProfile {
        // Extract connection_type from api_url/cli_path
        let connection_type = if self.cli_path.is_some() {
            "local-cli".to_string()
        } else if self.api_url == "https://ampcode.com" {
            "production".to_string()
        } else {
            "local-server".to_string()
        };

        // Parse timestamps
        let created_at = chrono::DateTime::parse_from_rfc3339(&self.created_at)
            .map(|dt| dt.timestamp())
            .unwrap_or(0);
        let updated_at = chrono::DateTime::parse_from_rfc3339(&self.updated_at)
            .map(|dt| dt.timestamp())
            .unwrap_or(0);

        AmpProfile {
            id: self.id.clone(),
            name: self.name.clone(),
            connection_type,
            api_url: if self.api_url == "https://ampcode.com" { None } else { Some(self.api_url.clone()) },
            cli_path: self.cli_path.clone(),
            token: None, // Tokens are stored separately in keychain
            tls_enabled: Some(!self.tls_insecure),
            is_active,
            created_at,
            updated_at,
        }
    }
}

// Tauri Commands
#[tauri::command]
pub async fn profiles_list(
    profile_manager: State<'_, ProfileManager>,
) -> Result<Vec<AmpProfile>, String> {
    let db_pool_guard = profile_manager.db_pool.read().await;
    let db = db_pool_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    
    let active_id = profile_manager.active_profile_id.read().await.clone();
    
    // Load all profiles from database
    let profiles = sqlx::query_as::<_, ProfileRow>("SELECT * FROM profiles ORDER BY name")
        .fetch_all(db)
        .await
        .map_err(|e| format!("Failed to load profiles: {}", e))?;
    
    let mut result = Vec::new();
    for profile_row in profiles {
        let is_active = active_id.as_ref() == Some(&profile_row.id);
        result.push(profile_row.to_amp_profile(is_active));
    }
    
    Ok(result)
}

#[tauri::command]
pub async fn profile_create(
    profile: CreateProfileRequest,
    profile_manager: State<'_, ProfileManager>,
) -> Result<AmpProfile, String> {
    log::debug!("profile_create: Starting profile creation with data: {:?}", profile);
    
    // Check if ProfileManager is initialized
    log::debug!("profile_create: Acquiring database pool lock");
    let db_pool_guard = profile_manager.db_pool.read().await;
    let db = db_pool_guard
        .as_ref()
        .ok_or_else(|| {
            log::error!("profile_create: Database not initialized - this should not happen after blocking initialization");
            "Database not initialized. Please restart the application.".to_string()
        })?;
    
    log::debug!("profile_create: Database pool acquired successfully");
    
    let profile_id = Uuid::new_v4().to_string();
    log::debug!("profile_create: Generated profile ID: {}", profile_id);
    
    let now = Utc::now().to_rfc3339();
    log::debug!("profile_create: Generated timestamp: {}", now);
    
    // Determine API URL based on connection type
    log::debug!("profile_create: Determining API URL for connection type: {}", profile.connection_type);
    let api_url = match profile.connection_type.as_str() {
        "production" => {
            log::debug!("profile_create: Using production URL");
            "https://ampcode.com".to_string()
        }
        "local-server" => {
            let url = profile.api_url.unwrap_or_else(|| "https://localhost:7002".to_string());
            log::debug!("profile_create: Using local server URL: {}", url);
            url
        }
        "local-cli" => {
            log::debug!("profile_create: Using local CLI with default production URL");
            "https://ampcode.com".to_string() // Default for CLI
        }
        _ => {
            log::error!("profile_create: Invalid connection type: {}", profile.connection_type);
            return Err("Invalid connection type".to_string());
        }
    };
    
    // Check if profile name already exists
    log::debug!("profile_create: Checking for existing profile with name: {}", profile.name);
    let existing_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM profiles WHERE name = ?"
    )
    .bind(&profile.name)
    .fetch_one(db)
    .await
    .map_err(|e| {
        log::error!("profile_create: Failed to check for duplicate profile names: {}", e);
        format!("Failed to check for duplicate profile names: {}", e)
    })?;
    
    log::debug!("profile_create: Found {} existing profiles with name '{}'", existing_count, profile.name);
    
    if existing_count > 0 {
        log::warn!("profile_create: Profile name '{}' already exists", profile.name);
        return Err(format!(
            "A profile named '{}' already exists. Please choose a different name.",
            profile.name
        ));
    }
    
    // Insert profile into database
    log::debug!("profile_create: Inserting profile into database");
    log::debug!("profile_create: Insert parameters - id: {}, name: {}, api_url: {}, cli_path: {:?}, tls_insecure: {}", 
        profile_id, profile.name, api_url, profile.cli_path, 
        profile.tls_enabled.map(|enabled| !enabled).unwrap_or(false));
    
    let insert_result = sqlx::query(
        "INSERT INTO profiles (id, name, api_url, cli_path, tls_insecure, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&profile_id)
    .bind(&profile.name)
    .bind(&api_url)
    .bind(&profile.cli_path)
    .bind(profile.tls_enabled.map(|enabled| !enabled).unwrap_or(false))
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await;
    
    match &insert_result {
        Ok(result) => {
            log::debug!("profile_create: Database insert successful, rows affected: {}", result.rows_affected());
        }
        Err(e) => {
            log::error!("profile_create: Database insert failed: {}", e);
        }
    }
    
    insert_result.map_err(|e| {
        // Handle SQLite unique constraint violation specifically
        if e.to_string().contains("UNIQUE constraint failed") {
            log::warn!("profile_create: Unique constraint violation for profile name: {}", profile.name);
            format!("A profile named '{}' already exists. Please choose a different name.", profile.name)
        } else {
            log::error!("profile_create: Database insert error: {}", e);
            format!("Failed to create profile: {}", e)
        }
    })?;
    
    // Store token in keychain if provided
    if let Some(ref token) = profile.token {
        log::debug!("profile_create: Storing token in keychain for profile: {}", profile_id);
        let keychain = KeychainAuth::new();
        if let Err(e) = keychain.store_token(&profile_id, TokenType::AccessToken, token) {
            log::warn!("profile_create: Failed to store token for new profile: {}", e);
        } else {
            log::debug!("profile_create: Token stored successfully in keychain");
        }
    } else {
        log::debug!("profile_create: No token provided, skipping keychain storage");
    }
    
    // Load the created profile and add to context
    log::debug!("profile_create: Creating profile row structure");
    let profile_row = ProfileRow {
        id: profile_id.clone(),
        name: profile.name.clone(),
        api_url: api_url.clone(),
        cli_path: profile.cli_path.clone(),
        tls_insecure: profile.tls_enabled.map(|enabled| !enabled).unwrap_or(false),
        db_namespace: None,
        last_used_at: None,
        created_at: now.clone(),
        updated_at: now,
    };
    
    log::debug!("profile_create: Creating profile context and adding to manager");
    let profile_ctx = Arc::new(RwLock::new(ProfileCtx::new(profile_row.clone())));
    profile_manager.profiles.insert(profile_id.clone(), profile_ctx);
    log::debug!("profile_create: Profile context added to manager");
    
    let amp_profile = profile_row.to_amp_profile(false);
    log::debug!("profile_create: Created AmpProfile: {:?}", amp_profile);
    
    log::info!("profile_create: Successfully created profile '{}' with ID: {}", profile.name, profile_id);
    Ok(amp_profile)
}

#[tauri::command]
pub async fn profile_update(
    id: String,
    updates: CreateProfileRequest,
    profile_manager: State<'_, ProfileManager>,
) -> Result<AmpProfile, String> {
    let db_pool_guard = profile_manager.db_pool.read().await;
    let db = db_pool_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    
    let now = Utc::now().to_rfc3339();
    
    // Determine API URL based on connection type
    let api_url = match updates.connection_type.as_str() {
        "production" => "https://ampcode.com".to_string(),
        "local-server" => updates.api_url.unwrap_or_else(|| "https://localhost:7002".to_string()),
        "local-cli" => "https://ampcode.com".to_string(),
        _ => return Err("Invalid connection type".to_string()),
    };
    
    // Check if profile name already exists (excluding current profile)
    let existing_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM profiles WHERE name = ? AND id != ?"
    )
    .bind(&updates.name)
    .bind(&id)
    .fetch_one(db)
    .await
    .map_err(|e| format!("Failed to check for duplicate profile names: {}", e))?;
    
    if existing_count > 0 {
        return Err(format!(
            "A profile named '{}' already exists. Please choose a different name.",
            updates.name
        ));
    }

    // Update profile in database
    sqlx::query(
        "UPDATE profiles SET name = ?, api_url = ?, cli_path = ?, tls_insecure = ?, updated_at = ? WHERE id = ?"
    )
    .bind(&updates.name)
    .bind(&api_url)
    .bind(&updates.cli_path)
    .bind(updates.tls_enabled.map(|enabled| !enabled).unwrap_or(false))
    .bind(&now)
    .bind(&id)
    .execute(db)
    .await
    .map_err(|e| {
        // Handle SQLite unique constraint violation specifically
        if e.to_string().contains("UNIQUE constraint failed") {
            format!("A profile named '{}' already exists. Please choose a different name.", updates.name)
        } else {
            format!("Failed to update profile: {}", e)
        }
    })?;
    
    // Update token in keychain if provided
    if let Some(token) = updates.token {
        let keychain = KeychainAuth::new();
        if let Err(e) = keychain.store_token(&id, TokenType::AccessToken, &token) {
            log::warn!("Failed to update token for profile: {}", e);
        }
    }
    
    // Update in-memory context if it exists
    if let Some(profile_entry) = profile_manager.profiles.get(&id) {
        let mut profile_ctx = profile_entry.write().await;
        profile_ctx.profile.name = updates.name.clone();
        profile_ctx.profile.api_url = api_url.clone();
        profile_ctx.profile.cli_path = updates.cli_path.clone();
        profile_ctx.profile.tls_insecure = updates.tls_enabled.map(|enabled| !enabled).unwrap_or(false);
        profile_ctx.profile.updated_at = now.clone();
    }
    
    // Get active status
    let active_id = profile_manager.active_profile_id.read().await.clone();
    let is_active = active_id.as_ref() == Some(&id);
    
    // Return updated profile
    let profile_row = ProfileRow {
        id: id.clone(),
        name: updates.name,
        api_url,
        cli_path: updates.cli_path,
        tls_insecure: updates.tls_enabled.map(|enabled| !enabled).unwrap_or(false),
        db_namespace: None,
        last_used_at: None,
        created_at: now.clone(), // We don't have the original created_at here
        updated_at: now,
    };
    
    Ok(profile_row.to_amp_profile(is_active))
}

#[tauri::command]
pub async fn profile_delete(
    id: String,
    profile_manager: State<'_, ProfileManager>,
) -> Result<(), String> {
    let db_pool_guard = profile_manager.db_pool.read().await;
    let db = db_pool_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    
    // Don't allow deleting the active profile
    let active_id = profile_manager.active_profile_id.read().await.clone();
    if active_id.as_ref() == Some(&id) {
        return Err("Cannot delete the active profile".to_string());
    }
    
    // Delete from database
    sqlx::query("DELETE FROM profiles WHERE id = ?")
        .bind(&id)
        .execute(db)
        .await
        .map_err(|e| format!("Failed to delete profile: {}", e))?;
    
    // Clear tokens from keychain
    let keychain = KeychainAuth::new();
    if let Err(e) = keychain.clear_profile_tokens(&id) {
        log::warn!("Failed to clear tokens for deleted profile: {}", e);
    }
    
    // Remove from in-memory context
    profile_manager.profiles.remove(&id);
    
    Ok(())
}

#[tauri::command]
pub async fn profile_activate(
    id: String,
    profile_manager: State<'_, ProfileManager>,
) -> Result<AmpProfile, String> {
    profile_manager.activate_profile(id.clone()).await?;
    
    // Get the activated profile
    if let Some(profile_entry) = profile_manager.profiles.get(&id) {
        let profile_ctx = profile_entry.read().await;
        Ok(profile_ctx.profile.to_amp_profile(true))
    } else {
        Err("Profile not found after activation".to_string())
    }
}

#[tauri::command]
pub async fn list_profiles(
    profile_manager: State<'_, ProfileManager>,
) -> Result<Vec<ProfileInfo>, String> {
    let active_id = profile_manager.active_profile_id.read().await.clone();
    let keychain = KeychainAuth::new();
    let mut profiles = Vec::new();
    
    for (profile_id, profile_ctx) in profile_manager.get_all_profiles() {
        let ctx = profile_ctx.read().await;
        let is_active = active_id.as_ref() == Some(&profile_id);
        let has_stored_tokens = keychain.has_profile_tokens(&profile_id);
        
        profiles.push(ProfileInfo {
            id: ctx.profile.id.clone(),
            name: ctx.profile.name.clone(),
            api_url: ctx.profile.api_url.clone(),
            cli_path: ctx.profile.cli_path.clone(),
            tls_insecure: ctx.profile.tls_insecure,
            db_namespace: ctx.profile.db_namespace.clone(),
            last_used_at: ctx.profile.last_used_at.clone(),
            is_active,
            has_stored_tokens,
        });
    }
    
    // Sort by name
    profiles.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(profiles)
}

#[tauri::command]
pub async fn activate_profile(
    profile_id: String,
    profile_manager: State<'_, ProfileManager>,
) -> Result<(), String> {
    profile_manager.activate_profile(profile_id).await
}

#[tauri::command]
pub async fn get_active_profile(
    profile_manager: State<'_, ProfileManager>,
) -> Result<Option<ProfileInfo>, String> {
    let active_profile = profile_manager.get_active_profile().await;
    let keychain = KeychainAuth::new();
    
    match active_profile {
        Some(profile_ctx) => {
            let ctx = profile_ctx.read().await;
            let has_stored_tokens = keychain.has_profile_tokens(&ctx.profile.id);
            Ok(Some(ProfileInfo {
                id: ctx.profile.id.clone(),
                name: ctx.profile.name.clone(),
                api_url: ctx.profile.api_url.clone(),
                cli_path: ctx.profile.cli_path.clone(),
                tls_insecure: ctx.profile.tls_insecure,
                db_namespace: ctx.profile.db_namespace.clone(),
                last_used_at: ctx.profile.last_used_at.clone(),
                is_active: true,
                has_stored_tokens,
            }))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn login(
    profile_id: String,
    credentials: LoginCredentials,
    profile_manager: State<'_, ProfileManager>,
    app_handle: AppHandle,
) -> Result<AuthStatus, String> {
    // Get the profile context
    let profile_entry = profile_manager
        .profiles
        .get(&profile_id)
        .ok_or(format!("Profile '{}' not found", profile_id))?;
    
    let profile_ctx = profile_entry.read().await;
    
    // Apply credentials to environment
    let mut config = profile_ctx.to_resolved_config();
    
    if let Some(ref token) = credentials.token {
        config.env_vars.insert("AMP_TOKEN".to_string(), token.clone());
    }
    
    if let Some(ref email) = credentials.email {
        config.env_vars.insert("AMP_EMAIL".to_string(), email.clone());
    }
    
    if let Some(ref password) = credentials.password {
        config.env_vars.insert("AMP_PASSWORD".to_string(), password.clone());
    }
    
    // Attempt authentication
    let auth_result = ensure_auth(&app_handle, &config).await;
    
    // If authentication was successful, store credentials in keychain
    if let Ok(ref _auth_status) = auth_result {
        if let Err(e) = profile_manager.store_auth_credentials(&profile_id, &credentials).await {
            log::warn!("Failed to store auth credentials for profile {}: {}", profile_id, e);
            // Don't fail the login if keychain storage fails
        }
    }
    
    auth_result
}

#[tauri::command]
pub async fn logout(
    profile_id: String,
    profile_manager: State<'_, ProfileManager>,
) -> Result<(), String> {
    // Clear tokens from keychain
    profile_manager.clear_profile_auth(&profile_id).await?;
    
    // Clear tokens from profile context environment variables
    if let Some(profile_entry) = profile_manager.profiles.get(&profile_id) {
        let mut profile_ctx = profile_entry.write().await;
        profile_ctx.env_vars.remove("AMP_TOKEN");
        profile_ctx.env_vars.remove("AMP_REFRESH_TOKEN");
        profile_ctx.env_vars.remove("AMP_API_KEY");
        profile_ctx.env_vars.remove("AMP_EMAIL");
        profile_ctx.env_vars.remove("AMP_PASSWORD");
    }
    
    log::debug!("Logged out profile {}", profile_id);
    Ok(())
}

pub fn init_profile_manager(app_handle: AppHandle) -> ProfileManager {
    ProfileManager::new(app_handle)
}
