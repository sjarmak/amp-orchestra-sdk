use crate::app_state::AppState;
use crate::keychain_auth;
use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenResponse {
    access_token: String,
    expires_in: Option<u64>,
    token_type: Option<String>,
}

#[tauri::command]
pub async fn cli_login(profile: String, app_state: State<'_, AppState>) -> Result<(), String> {
    log::info!("Starting CLI login for profile: {}", profile);
    
    let runtime_config = {
        match app_state.lock() {
            Ok(mut config) => {
                config.update_runtime_config();
                config.get_runtime_config()
            }
            Err(e) => return Err(format!("Failed to get runtime config: {}", e)),
        }
    };

    log::debug!("Using CLI path: {}", runtime_config.cli_path);
    log::debug!("Using Amp URL: {}", runtime_config.amp_url);

    let mut cmd = if runtime_config.use_local_cli {
        let mut c = Command::new("node");
        c.arg(&runtime_config.cli_path);
        c
    } else {
        Command::new(&runtime_config.cli_path)
    };

    cmd.env("AMP_SERVER_URL", &runtime_config.amp_url)
        .args(["login", "--profile", &profile])
        .args(&runtime_config.extra_args);

    log::debug!("Executing CLI login command");
    let output = cmd.output().map_err(|e| {
        log::error!("Failed to execute CLI login: {}", e);
        format!("Failed to execute CLI login: {}", e)
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("CLI login failed: {}", stderr);
        return Err(format!("CLI login failed: {}", stderr));
    }

    log::info!("CLI login completed successfully for profile: {}", profile);
    Ok(())
}

#[tauri::command]
pub async fn get_cli_token(profile: String, app_state: State<'_, AppState>) -> Result<String, String> {
    log::debug!("Getting CLI token for profile: {}", profile);
    
    let runtime_config = {
        match app_state.lock() {
            Ok(mut config) => {
                config.update_runtime_config();
                config.get_runtime_config()
            }
            Err(e) => return Err(format!("Failed to get runtime config: {}", e)),
        }
    };

    let mut cmd = if runtime_config.use_local_cli {
        let mut c = Command::new("node");
        c.arg(&runtime_config.cli_path);
        c
    } else {
        Command::new(&runtime_config.cli_path)
    };

    cmd.env("AMP_SERVER_URL", &runtime_config.amp_url)
        .args(["auth", "token", "--json"])
        .args(&runtime_config.extra_args);

    let output = cmd.output().map_err(|e| {
        log::error!("Failed to get CLI token: {}", e);
        format!("Failed to get CLI token: {}", e)
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("CLI token fetch failed: {}", stderr);
        return Err(format!("CLI token fetch failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let token_response: TokenResponse = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Store token in keychain
    keychain_auth::store_profile_token(profile.clone(), "access".to_string(), token_response.access_token.clone())
        .await
        .map_err(|e| format!("Failed to store token in keychain: {}", e))?;

    log::debug!("Token successfully retrieved and stored for profile: {}", profile);
    Ok(token_response.access_token)
}
