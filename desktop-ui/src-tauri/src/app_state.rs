use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::fs;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub amp_url: String,
    pub cli_path: String,
    pub extra_args: Vec<String>,
    pub use_local_cli: bool,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            amp_url: "https://ampcode.com".to_string(),
            cli_path: "amp".to_string(),
            extra_args: vec![],
            use_local_cli: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub amp_env: HashMap<String, String>,
    pub connection_mode: Option<String>,
    pub custom_cli_path: Option<String>,
    pub local_server_url: Option<String>,
    // New centralized runtime config
    pub runtime: RuntimeConfig,
    // Active toolbox profile ID for persistence
    pub active_toolbox_profile_id: Option<i64>,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut amp_env = HashMap::new();
        // Default to production mode using system amp binary
        amp_env.insert("AMP_BIN".to_string(), "amp".to_string());
        Self {
            amp_env,
            connection_mode: Some("production".to_string()),
            custom_cli_path: None,
            local_server_url: None,
            runtime: RuntimeConfig::default(),
            active_toolbox_profile_id: None,
        }
    }
}

impl AppConfig {
    pub fn config_path() -> PathBuf {
        let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("ampsm");
        path.push("config.json");
        path
    }

    // Pure helper to compose env from config without needing tauri::State (for tests and integration shims)
    pub fn compose_env(&self) -> HashMap<String, String> {
        let mut merged_env = self.get_merged_env();
        match self.connection_mode.as_deref() {
            Some("local-cli") => {
                if !merged_env.contains_key("AMP_CLI_PATH") {
                    if let Some(p) = self.custom_cli_path.clone() {
                        merged_env.insert("AMP_CLI_PATH".into(), p);
                    } else {
                        merged_env.insert("AMP_CLI_PATH".into(), "/Users/sjarmak/amp/cli/dist/main.js".into());
                    }
                }
                if !merged_env.contains_key("AMP_URL") {
                    if let Some(u) = self.local_server_url.clone() { merged_env.insert("AMP_URL".into(), u); }
                }
                merged_env.remove("AMP_BIN");
                merged_env.remove("NODE_TLS_REJECT_UNAUTHORIZED");
            }
            _ => {
                merged_env.remove("AMP_CLI_PATH");
                merged_env.remove("AMP_URL");
                merged_env.remove("NODE_TLS_REJECT_UNAUTHORIZED");
                merged_env.entry("AMP_BIN".into()).or_insert("amp".into());
            }
        }
        merged_env
    }

    pub async fn load() -> Self {
        let primary = Self::config_path();
        // Fallback candidates
        let mac = dirs::home_dir().map(|mut p| { p.push("Library"); p.push("Application Support"); p.push("ampsm"); p.push("config.json"); p });
        let xdg = dirs::home_dir().map(|mut p| { p.push(".config"); p.push("ampsm"); p.push("config.json"); p });
        let candidates = [Some(primary.clone()), mac, xdg];
        let _ = std::fs::create_dir_all("/Users/sjarmak/amp-orchestra/logs");
        for cand in candidates.iter().flatten() {
            let _ = std::fs::OpenOptions::new().create(true).append(true).open("/Users/sjarmak/amp-orchestra/logs/startup-env.log").and_then(|mut f| std::io::Write::write_all(&mut f, format!("try load config: {:?}\n", cand).as_bytes()));
            if let Ok(content) = fs::read_to_string(cand).await {
                let _ = std::fs::OpenOptions::new().create(true).append(true).open("/Users/sjarmak/amp-orchestra/logs/startup-env.log").and_then(|mut f| std::io::Write::write_all(&mut f, format!("config content: {}\n", content).as_bytes()));
                match serde_json::from_str::<AppConfig>(&content) {
                    Ok(config) => {
                        let _ = std::fs::OpenOptions::new().create(true).append(true).open("/Users/sjarmak/amp-orchestra/logs/startup-env.log").and_then(|mut f| std::io::Write::write_all(&mut f, format!("parsed config: mode={:?} cli_path={:?}\n", config.connection_mode, config.custom_cli_path).as_bytes()));
                        return config;
                    }
                    Err(e) => {
                        let _ = std::fs::OpenOptions::new().create(true).append(true).open("/Users/sjarmak/amp-orchestra/logs/startup-env.log").and_then(|mut f| std::io::Write::write_all(&mut f, format!("parse error: {}\n", e).as_bytes()));
                    }
                }
            }
        }
        // Return default config if file doesn't exist or is invalid
        Self::default()
    }

    pub async fn save(&self) -> Result<(), String> {
        let config_path = Self::config_path();
        
        // Create directory if it doesn't exist
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).await
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        fs::write(&config_path, content).await
            .map_err(|e| format!("Failed to write config file: {}", e))?;

        Ok(())
    }

    pub fn set_env(&mut self, key: String, value: String) {
        // Redact sensitive values in logs
        let display_value = if key.to_uppercase().contains("TOKEN") 
            || key.to_uppercase().contains("SECRET") 
            || key.to_uppercase().contains("KEY") {
            "[REDACTED]".to_string()
        } else {
            value.clone()
        };
        
        log::info!("Setting environment variable: {}={}", key, display_value);
        self.amp_env.insert(key, value);
    }

    pub fn get_merged_env(&self) -> HashMap<String, String> {
        // Only include variables explicitly set in the app config to avoid leaking shell env
        let mut env = HashMap::new();
        for (key, value) in &self.amp_env {
            env.insert(key.clone(), value.clone());
        }
        
        // Always include PATH so we can find system binaries like node
        if let Some(path) = std::env::var("PATH").ok() {
            env.insert("PATH".to_string(), path);
        }
        
        env
    }

    pub fn update_runtime_config(&mut self) {
        // Update runtime config based on environment variables and stored config
        let env = self.get_merged_env();
        
        // Set Amp URL based on environment
        if let Some(url) = env.get("AMP_URL").or_else(|| self.local_server_url.as_ref()) {
            self.runtime.amp_url = url.clone();
        }
        
        // Set CLI path based on environment or stored config
        if let Some(cli_path) = env.get("AMP_CLI_PATH").or_else(|| self.custom_cli_path.as_ref()) {
            self.runtime.cli_path = cli_path.clone();
            self.runtime.use_local_cli = !cli_path.eq("amp");
        }
        
        // Add extra args if needed
        if env.contains_key("NODE_TLS_REJECT_UNAUTHORIZED") {
            self.runtime.extra_args.push("--insecure".to_string());
        }
    }

    pub fn get_runtime_config(&self) -> RuntimeConfig {
        self.runtime.clone()
    }
}

#[tauri::command]
pub async fn get_runtime_config(app_state: tauri::State<'_, AppState>) -> Result<RuntimeConfig, String> {
    match app_state.lock() {
        Ok(mut config) => {
            config.update_runtime_config();
            Ok(config.get_runtime_config())
        }
        Err(e) => Err(format!("Failed to get runtime config: {}", e)),
    }
}

pub type AppState = Arc<Mutex<AppConfig>>;

pub fn init_app_state() -> AppState {
    Arc::new(Mutex::new(AppConfig::default()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compose_env_production_defaults() {
        let cfg = AppConfig::default();
        let env = cfg.compose_env();
        assert_eq!(env.get("AMP_BIN").map(|s| s.as_str()), Some("amp"));
        assert!(!env.contains_key("AMP_CLI_PATH"));
        assert!(!env.contains_key("AMP_URL"));
    }

    #[test]
    fn compose_env_local_cli_sets_cli_path_and_url() {
        let mut cfg = AppConfig::default();
        cfg.connection_mode = Some("local-cli".to_string());
        cfg.custom_cli_path = Some("/tmp/cli/main.js".to_string());
        cfg.local_server_url = Some("https://localhost:7002".to_string());
        let env = cfg.compose_env();
        assert_eq!(env.get("AMP_CLI_PATH").map(|s| s.as_str()), Some("/tmp/cli/main.js"));
        assert_eq!(env.get("AMP_URL").map(|s| s.as_str()), Some("https://localhost:7002"));
        assert!(!env.contains_key("AMP_BIN"));
        assert!(!env.contains_key("NODE_TLS_REJECT_UNAUTHORIZED"));
    }

    #[test]
    fn compose_env_local_cli_falls_back_default_cli_path() {
        let mut cfg = AppConfig::default();
        cfg.connection_mode = Some("local-cli".to_string());
        let env = cfg.compose_env();
        assert!(env.contains_key("AMP_CLI_PATH"));
        assert!(!env.contains_key("AMP_BIN"));
    }
}
