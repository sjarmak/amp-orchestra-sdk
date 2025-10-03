use crate::app_state::AppState;
use crate::keychain_auth;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyRequest {
    pub method: String,
    pub path: String,
    pub body: Option<String>,
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[tauri::command]
pub async fn amp_proxy(
    req: ProxyRequest,
    profile: Option<String>,
    app_state: State<'_, AppState>,
) -> Result<ProxyResponse, String> {
    log::debug!("Proxying {} request to {}", req.method, req.path);

    let runtime_config = {
        match app_state.lock() {
            Ok(mut config) => {
                config.update_runtime_config();
                config.get_runtime_config()
            }
            Err(e) => return Err(format!("Failed to get runtime config: {}", e)),
        }
    };

    let url = format!("{}{}", runtime_config.amp_url, req.path);
    log::debug!("Full URL: {}", url);

    let client = Client::new();
    let mut builder = match req.method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        _ => return Err(format!("Unsupported HTTP method: {}", req.method)),
    };

    // Add request body if present
    if let Some(body) = req.body {
        builder = builder
            .header("Content-Type", "application/json")
            .body(body);
    }

    // Add custom headers
    if let Some(headers) = req.headers {
        for (key, value) in headers {
            builder = builder.header(&key, &value);
        }
    }

    // Get and attach bearer token
    let profile_name = profile.unwrap_or_else(|| "default".to_string());
    match keychain_auth::get_profile_token(profile_name.clone(), "access".to_string()).await {
        Ok(token) => {
            log::debug!("Using stored token for profile: {}", profile_name);
            builder = builder.bearer_auth(token);
        }
        Err(e) => {
            log::error!("Failed to get token from keychain: {}", e);
            return Err(format!("Failed to get authentication token: {}", e));
        }
    }

    // Send request
    let response = builder.send().await.map_err(|e| {
        log::error!("HTTP request failed: {}", e);
        format!("HTTP request failed: {}", e)
    })?;

    let status = response.status().as_u16();
    let mut response_headers = HashMap::new();
    
    // Collect response headers
    for (name, value) in response.headers().iter() {
        if let Ok(value_str) = value.to_str() {
            response_headers.insert(name.to_string(), value_str.to_string());
        }
    }

    let body = response.text().await.map_err(|e| {
        log::error!("Failed to read response body: {}", e);
        format!("Failed to read response body: {}", e)
    })?;

    log::debug!("Response status: {}", status);

    Ok(ProxyResponse {
        status,
        body,
        headers: response_headers,
    })
}

#[tauri::command]
pub async fn amp_proxy_simple(
    method: String,
    path: String,
    body: Option<String>,
    profile: Option<String>,
    app_state: State<'_, AppState>,
) -> Result<String, String> {
    let req = ProxyRequest {
        method,
        path,
        body,
        headers: None,
    };

    let response = amp_proxy(req, profile, app_state).await?;
    
    if response.status >= 400 {
        return Err(format!("HTTP {}: {}", response.status, response.body));
    }
    
    Ok(response.body)
}
