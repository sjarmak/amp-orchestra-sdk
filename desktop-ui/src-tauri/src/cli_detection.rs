use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio::time::timeout;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliProfile {
    pub name: String,
    pub path: String,
    pub detection_method: String,
    pub version: Option<String>,
    pub is_valid: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

pub struct CliDetector {
    app_handle: AppHandle,
}

impl CliDetector {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    /// Auto-detect all available CLI profiles using various strategies
    pub async fn auto_detect_profiles(&self) -> Vec<CliProfile> {
        let mut profiles = Vec::new();
        
        // Try detection strategies in priority order
        let strategies = vec![
            ("manual", self.detect_manual_override().await),
            ("bundled", self.detect_bundled().await),
            ("global", self.detect_global().await),
            ("dev-home", self.detect_dev_home().await),
        ];

        for (method, maybe_path) in strategies {
            if let Some(path) = maybe_path {
                let validation = self.validate_cli_path(&path).await;
                profiles.push(CliProfile {
                    name: format!("Amp CLI ({})", method),
                    path: path.clone(),
                    detection_method: method.to_string(),
                    version: validation.version.clone(),
                    is_valid: validation.is_valid,
                    error: validation.error,
                });
            }
        }

        profiles
    }

    /// Detect CLI path via AMP_CLI_PATH environment variable
    async fn detect_manual_override(&self) -> Option<String> {
        std::env::var("AMP_CLI_PATH").ok()
    }

    /// Detect CLI binary bundled with the app
    async fn detect_bundled(&self) -> Option<String> {
        if let Ok(resource_dir) = self.app_handle.path().resource_dir() {
            let candidates = vec![
                resource_dir.join("bin").join(self.cli_binary_name()),
                resource_dir.join("amp").join(self.cli_binary_name()),
                resource_dir.join(self.cli_binary_name()),
            ];

            for candidate in candidates {
                if candidate.exists() && candidate.is_file() {
                    if let Some(path) = candidate.to_str() {
                        return Some(path.to_string());
                    }
                }
            }
        }
        None
    }

    /// Detect globally installed CLI using `which amp` or `where amp`
    async fn detect_global(&self) -> Option<String> {
        let which_cmd = if cfg!(windows) { "where" } else { "which" };
        
        match Command::new(which_cmd)
            .arg("amp")
            .output()
        {
            Ok(output) if output.status.success() => {
                if let Ok(path) = String::from_utf8(output.stdout) {
                    let path = path.trim();
                    if !path.is_empty() && Path::new(path).exists() {
                        return Some(path.to_string());
                    }
                }
            }
            _ => {}
        }
        None
    }

    /// Detect development CLI in ~/amp directory
    async fn detect_dev_home(&self) -> Option<String> {
        if let Some(home_dir) = dirs::home_dir() {
            let candidates = vec![
                // Node.js development build
                home_dir.join("amp").join("cli").join("dist").join("main.js"),
                // Binary development build
                home_dir.join("amp").join("bin").join(self.cli_binary_name()),
                home_dir.join("amp").join("target").join("release").join(self.cli_binary_name()),
                home_dir.join("amp").join("target").join("debug").join(self.cli_binary_name()),
            ];

            for candidate in candidates {
                if candidate.exists() && candidate.is_file() {
                    if let Some(path) = candidate.to_str() {
                        return Some(path.to_string());
                    }
                }
            }
        }
        None
    }

    /// Validate a CLI path by running `amp --version`
    pub async fn validate_cli_path(&self, path: &str) -> ValidationResult {
        let path_buf = PathBuf::from(path);
        
        // Check if path exists
        if !path_buf.exists() {
            return ValidationResult {
                is_valid: false,
                version: None,
                error: Some("CLI path does not exist".to_string()),
            };
        }

        // Determine how to execute the CLI
        let (command, args) = if path.ends_with(".js") {
            ("node", vec![path, "--version"])
        } else {
            (path, vec!["--version"])
        };

        // Run with timeout
        match timeout(Duration::from_secs(2), async {
            Command::new(command)
                .args(&args)
                .output()
        }).await {
            Ok(Ok(output)) if output.status.success() => {
                if let Ok(version_output) = String::from_utf8(output.stdout) {
                    let version = version_output.trim();
                    if self.is_version_compatible(version) {
                        ValidationResult {
                            is_valid: true,
                            version: Some(version.to_string()),
                            error: None,
                        }
                    } else {
                        ValidationResult {
                            is_valid: false,
                            version: Some(version.to_string()),
                            error: Some("Incompatible CLI version".to_string()),
                        }
                    }
                } else {
                    ValidationResult {
                        is_valid: false,
                        version: None,
                        error: Some("Invalid version output".to_string()),
                    }
                }
            }
            Ok(Ok(output)) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                ValidationResult {
                    is_valid: false,
                    version: None,
                    error: Some(format!("CLI execution failed: {}", stderr)),
                }
            }
            Ok(Err(e)) => {
                ValidationResult {
                    is_valid: false,
                    version: None,
                    error: Some(format!("Failed to execute CLI: {}", e)),
                }
            }
            Err(_) => {
                ValidationResult {
                    is_valid: false,
                    version: None,
                    error: Some("CLI execution timed out".to_string()),
                }
            }
        }
    }

    /// Check if CLI version is compatible
    fn is_version_compatible(&self, version: &str) -> bool {
        // For now, accept any version that looks like a semantic version
        // TODO: Implement proper version compatibility checking
        version.chars().any(|c| c.is_ascii_digit())
    }

    /// Get the CLI binary name for the current platform
    fn cli_binary_name(&self) -> String {
        if cfg!(windows) {
            "amp.exe".to_string()
        } else {
            "amp".to_string()
        }
    }

    /// Get default profile configurations
    pub fn get_default_profiles() -> Vec<HashMap<String, String>> {
        vec![
            {
                let mut profile = HashMap::new();
                profile.insert("name".to_string(), "Production Amp".to_string());
                profile.insert("description".to_string(), "Use production Amp CLI".to_string());
                profile.insert("env_vars".to_string(), r#"{"AMP_BIN":"amp"}"#.to_string());
                profile
            },
            {
                let mut profile = HashMap::new();
                profile.insert("name".to_string(), "Local Development".to_string());
                profile.insert("description".to_string(), "Use local Amp development server".to_string());
                profile.insert("env_vars".to_string(), r#"{"AMP_CLI_PATH":"~/amp/cli/dist/main.js","AMP_URL":"https://localhost:7002","NODE_TLS_REJECT_UNAUTHORIZED":"0"}"#.to_string());
                profile
            },
            {
                let mut profile = HashMap::new();
                profile.insert("name".to_string(), "Custom CLI Path".to_string());
                profile.insert("description".to_string(), "Specify custom Amp CLI path".to_string());
                profile.insert("env_vars".to_string(), r#"{"AMP_CLI_PATH":""}"#.to_string());
                profile
            },
        ]
    }

    /// Check health of existing CLI profiles periodically
    pub async fn health_check_profiles(&self, profiles: &[CliProfile]) -> Vec<CliProfile> {
        let mut updated_profiles = Vec::new();
        
        for profile in profiles {
            let validation = self.validate_cli_path(&profile.path).await;
            let mut updated_profile = profile.clone();
            updated_profile.is_valid = validation.is_valid;
            updated_profile.version = validation.version;
            updated_profile.error = validation.error;
            updated_profiles.push(updated_profile);
        }
        
        updated_profiles
    }
}

// Tauri commands
#[tauri::command]
pub async fn detect_cli_profiles(app: AppHandle) -> Result<Vec<CliProfile>, String> {
    let detector = CliDetector::new(app);
    Ok(detector.auto_detect_profiles().await)
}

#[tauri::command]
pub async fn validate_cli_path(app: AppHandle, path: String) -> Result<ValidationResult, String> {
    let detector = CliDetector::new(app);
    Ok(detector.validate_cli_path(&path).await)
}

#[tauri::command]
pub async fn install_global_cli() -> Result<String, String> {
    match Command::new("npm")
        .args(&["install", "-g", "@sourcegraph/amp"])
        .output()
    {
        Ok(output) if output.status.success() => {
            Ok("CLI installed successfully".to_string())
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Installation failed: {}", stderr))
        }
        Err(e) => {
            Err(format!("Failed to run npm install: {}", e))
        }
    }
}

#[tauri::command]
pub async fn get_default_profiles() -> Result<Vec<HashMap<String, String>>, String> {
    Ok(CliDetector::get_default_profiles())
}

#[tauri::command]
pub async fn health_check_profiles(
    app: AppHandle, 
    profiles: Vec<CliProfile>
) -> Result<Vec<CliProfile>, String> {
    let detector = CliDetector::new(app);
    Ok(detector.health_check_profiles(&profiles).await)
}

#[tauri::command]
#[allow(dead_code)]
pub async fn detect_amp_cli_paths(app: AppHandle) -> Result<Vec<String>, String> {
    let detector = CliDetector::new(app);
    let profiles = detector.auto_detect_profiles().await;
    
    // Extract just the paths from the profiles and filter for valid ones
    let paths: Vec<String> = profiles
        .into_iter()
        .filter(|profile| profile.is_valid)
        .map(|profile| profile.path)
        .collect();
    
    Ok(paths)
}
