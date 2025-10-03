use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthStatus {
    pub success: bool,
    pub message: String,
    pub version: Option<String>,
    pub connection_mode: String,
    pub connection_description: String,
}

#[derive(Clone, Debug)]
pub struct ResolvedConfig {
    pub server_url: Option<String>,
    pub amp_bin: Option<String>,
    pub amp_cli_path: Option<String>,
    pub amp_token: Option<String>,
    pub auth_cmd: Option<String>,
    pub cwd: PathBuf,
    pub env_vars: HashMap<String, String>,
    pub explicit_connection_mode: Option<String>,
}

impl ResolvedConfig {
    #[allow(dead_code)]
    pub fn from_env() -> Self {
        Self::from_env_with_overrides(HashMap::new())
    }

    pub fn from_env_with_overrides(overrides: HashMap<String, String>) -> Self {
        let mut env_vars: HashMap<String, String> = std::env::vars().collect();
        
        // Apply overrides from app config
        for (key, value) in overrides {
            env_vars.insert(key, value);
        }
        
        // Auto-detect local CLI and set up local server
        // But respect explicit AMP_BIN setting to force production mode
        let amp_cli_path = if env_vars.get("AMP_BIN").is_some() && env_vars.get("AMP_BIN") != Some(&"".to_string()) {
            // If AMP_BIN is explicitly set, don't use local CLI
            env_vars.get("AMP_CLI_PATH").cloned()
        } else {
            // Auto-detect local CLI
            env_vars.get("AMP_CLI_PATH").cloned()
                .or_else(|| {
                    let home_dir = dirs::home_dir()?;
                    let default_path = home_dir.join("amp/cli/dist/main.js");
                    if default_path.exists() {
                        Some(default_path.to_string_lossy().to_string())
                    } else {
                        None
                    }
                })
        };

        // If using local CLI and no server URL specified, default to local server
        if amp_cli_path.is_some() && env_vars.get("AMP_URL").is_none() {
            env_vars.insert("AMP_URL".to_string(), "https://localhost:7002".to_string());
            env_vars.insert("NODE_TLS_REJECT_UNAUTHORIZED".to_string(), "0".to_string());
        }

        let server_url = env_vars.get("AMP_URL").cloned();
        let amp_bin = env_vars.get("AMP_BIN").cloned().or_else(|| {
            if amp_cli_path.is_none() {
                Some("amp".to_string())
            } else {
                None
            }
        });

        Self {
            server_url,
            amp_bin,
            amp_cli_path,
            amp_token: env_vars.get("AMP_TOKEN").cloned(),
            auth_cmd: env_vars.get("AMP_AUTH_CMD").cloned(),
            cwd: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            env_vars,
            explicit_connection_mode: None,
        }
    }

    pub fn env(&self) -> &HashMap<String, String> {
        &self.env_vars
    }

    pub fn connection_mode(&self) -> &str {
        // Use explicit connection mode if set
        if let Some(mode) = &self.explicit_connection_mode {
            return mode;
        }
        
        if self.amp_cli_path.is_some() {
            "local-cli"
        } else {
            "production"
        }
    }
    
    pub fn override_connection_mode(&mut self, mode: String) {
        self.explicit_connection_mode = Some(mode);
    }

    pub fn connection_description(&self) -> String {
        match &self.server_url {
            Some(url) => {
                if url.contains("localhost") {
                    "Development mode".to_string()
                } else {
                    "Production mode".to_string()
                }
            },
            None => match (&self.amp_cli_path, &self.amp_bin) {
                (Some(cli_path), _) => format!("Using local CLI: {} (development)", cli_path),
                (None, Some(bin)) => {
                    if bin == "amp" {
                        "Production mode".to_string()
                    } else {
                        format!("Using system binary: {}", bin)
                    }
                },
                (None, None) => "No connection configured".to_string(),
            }
        }
    }
}

pub async fn ensure_auth(app: &AppHandle, config: &ResolvedConfig) -> Result<AuthStatus, String> {
    // Always check authentication by testing the amp command, regardless of server vs CLI mode

    // CLI mode requires auth and version check
    let bin_path = match (&config.amp_cli_path, &config.amp_bin) {
        (Some(cli_path), _) => {
            // For Node.js CLI, we need to use node as the binary
            if cli_path.ends_with(".js") {
                let node_bin = which::which("node")
                    .map_err(|_| "Node.js runtime not found - install Node.js or use system amp binary".to_string())?;
                (node_bin.to_string_lossy().to_string(), vec![cli_path.clone()])
            } else {
                (cli_path.clone(), vec![])
            }
        },
        (None, Some(bin)) => (bin.clone(), vec![]),
        (None, None) => return Err("No amp binary or CLI path configured".to_string()),
    };

    // 1. Run auth command if supplied
    if let Some(auth_cmd) = &config.auth_cmd {
        let replaced = auth_cmd.replace("$AMP_TOKEN", &config.amp_token.clone().unwrap_or_default());
        run_shell_command(app, &replaced, config.env(), &config.cwd).await?;
    }

    // 2. Version check
    let mut version_args = bin_path.1.clone();
    version_args.push("--version".to_string());
    
    let version_output = run_command(app, &bin_path.0, &version_args, config.env(), &config.cwd).await?;
    
    // Extract version from output
    let version = extract_version(&version_output);

    Ok(AuthStatus {
        success: true,
        message: format!("Authentication successful, version: {}", version.clone().unwrap_or("unknown".to_string())),
        version,
        connection_mode: config.connection_mode().to_string(),
        connection_description: config.connection_description(),
    })
}

async fn run_command(
    app: &AppHandle,
    bin: &str,
    args: &[String],
    env: &HashMap<String, String>,
    cwd: &Path,
) -> Result<String, String> {
    let shell = app.shell();
    
    let (mut rx, _child) = shell
        .command(bin)
        .args(args)
        .envs(env.clone())
        .current_dir(cwd)
        .spawn()
        .map_err(|e| format!("Failed to spawn command {}: {}", bin, e))?;

    let mut output = String::new();
    let mut error_output = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line);
                log::debug!("[amp stdout] {}", line_str);
                output.push_str(&line_str);
                output.push('\n');
            },
            CommandEvent::Stderr(line) => {
                let line_str = String::from_utf8_lossy(&line);
                log::warn!("[amp stderr] {}", line_str);
                error_output.push_str(&line_str);
                error_output.push('\n');
            },
            CommandEvent::Error(e) => return Err(format!("Command error: {}", e)),
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    return Err(format!("Command failed with exit code {:?}: {}", payload.code, error_output));
                }
                break;
            },
            _ => {} // Handle any other events
        }
    }

    Ok(output)
}

async fn run_shell_command(
    app: &AppHandle,
    cmd: &str,
    env: &HashMap<String, String>,
    cwd: &Path,
) -> Result<String, String> {
    let shell = app.shell();
    
    let (shell_bin, shell_args) = if cfg!(target_os = "windows") {
        ("cmd", vec!["/C".to_string(), cmd.to_string()])
    } else {
        ("sh", vec!["-c".to_string(), cmd.to_string()])
    };

    let (mut rx, _child) = shell
        .command(shell_bin)
        .args(&shell_args)
        .envs(env.clone())
        .current_dir(cwd)
        .spawn()
        .map_err(|e| format!("Failed to spawn shell command: {}", e))?;

    let mut output = String::new();
    let mut error_output = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line);
                log::debug!("[shell stdout] {}", line_str);
                output.push_str(&line_str);
                output.push('\n');
            },
            CommandEvent::Stderr(line) => {
                let line_str = String::from_utf8_lossy(&line);
                log::warn!("[shell stderr] {}", line_str);
                error_output.push_str(&line_str);
                error_output.push('\n');
            },
            CommandEvent::Error(e) => return Err(format!("Shell command error: {}", e)),
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    return Err(format!("Shell command failed with exit code {:?}: {}", payload.code, error_output));
                }
                break;
            },
            _ => {} // Handle any other events
        }
    }

    Ok(output)
}

fn extract_version(output: &str) -> Option<String> {
    // Try to extract version from output
    for line in output.lines() {
        if line.contains("version") || line.contains("Version") {
            // Extract version number
            if let Some(captures) = regex::Regex::new(r"(\d+\.\d+\.\d+)")
                .ok()?
                .captures(line) {
                return captures.get(1).map(|m| m.as_str().to_string());
            }
        }
    }
    
    // If no version pattern found, return first non-empty line
    output.lines().find(|l| !l.trim().is_empty()).map(|l| l.trim().to_string())
}
