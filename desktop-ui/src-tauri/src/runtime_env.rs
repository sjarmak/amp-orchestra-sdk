use std::collections::HashMap;
use std::path::PathBuf;
use anyhow::Result;
use unified_core::domain::AgentMode;

use crate::toolbox_resolver::ToolboxGuard;
use crate::toolbox_profiles::ToolboxProfile;
use crate::env_composer::{EnvComposer, ChatSpawnComposer};

pub struct ComposeResult {
    pub guard: Option<ToolboxGuard>,
}

pub fn compose_runtime_env(env: &mut HashMap<String, String>) -> Result<ComposeResult> {
    // Use the new EnvComposer trait with ChatSpawnComposer for backward compatibility
    let composer = ChatSpawnComposer;
    let result = composer.compose_env(env, None)?;
    Ok(ComposeResult { guard: result.guard })
}

// Overloaded function that accepts a ToolboxProfile directly
pub fn compose_runtime_env_with_profile(
    env: &mut HashMap<String, String>, 
    profile: Option<&ToolboxProfile>
) -> Result<ComposeResult> {
    // Use the new EnvComposer trait with ChatSpawnComposer and profile support
    let composer = ChatSpawnComposer;
    let result = composer.compose_env(env, profile)?;
    Ok(ComposeResult { guard: result.guard })
}

// Legacy split_paths function - now available in env_composer module
fn split_paths(s: &str) -> Vec<String> {
    crate::env_composer::split_paths(s)
}

/// Enhanced runtime environment for session management
#[derive(Debug, Clone)]
pub struct RuntimeEnvironment {
    pub env_kind: EnvKind,
    pub amp_config: AmpConfig,
    pub agent_mode: Option<AgentMode>,
    pub toolbox_config: ToolboxConfig,
    pub worktree_path: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub enum EnvKind {
    Production,
    LocalDevelopment,
    CI,
}

#[derive(Debug, Clone)]
pub struct AmpConfig {
    pub server_url: Option<String>,
    pub cli_path: Option<PathBuf>,
    pub agent_mode: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ToolboxConfig {
    pub toolbox_paths: Vec<PathBuf>,
    pub max_file_count: usize,
    pub max_total_size: u64,
}

impl Default for ToolboxConfig {
    fn default() -> Self {
        Self {
            toolbox_paths: Vec::new(),
            max_file_count: 10000,
            max_total_size: 500 * 1024 * 1024, // 500MB
        }
    }
}

impl RuntimeEnvironment {
    /// Create a new runtime environment with defaults
    pub fn new(env_kind: EnvKind) -> Self {
        Self {
            env_kind,
            amp_config: AmpConfig {
                server_url: None,
                cli_path: None,
                agent_mode: None,
            },
            agent_mode: None,
            toolbox_config: ToolboxConfig::default(),
            worktree_path: None,
        }
    }

    /// Compose complete environment for process spawning with worktree integration
    pub fn compose_environment(
        &self,
        env: &mut HashMap<String, String>,
        _session_id: Option<&str>,
    ) -> Result<ComposeResult> {
        // Set working directory to worktree if available
        if let Some(worktree_path) = &self.worktree_path {
            if let Some(path_str) = worktree_path.to_str() {
                env.insert("PWD".to_string(), path_str.to_string());
            }
        }

        // Set agent mode if specified
        if let Some(agent_mode) = &self.agent_mode {
            let agent_mode_str = match agent_mode {
                AgentMode::Default => "default",
                AgentMode::Geppetto => "geppetto:main",
                AgentMode::Claudetto => "claudetto:main",
                AgentMode::GronkFast => "gronk:fast",
                AgentMode::Bolt => "bolt",
                AgentMode::Custom(custom) => custom,
            };
            env.insert("AMP_EXPERIMENTAL_AGENT_MODE".to_string(), agent_mode_str.to_string());
        }

        // Set Amp configuration
        if let Some(server_url) = &self.amp_config.server_url {
            env.insert("AMP_URL".to_string(), server_url.clone());
        }

        if let Some(cli_path) = &self.amp_config.cli_path {
            env.insert("AMP_CLI_PATH".to_string(), cli_path.to_string_lossy().to_string());
        }

        // Handle toolbox configuration
        if !self.toolbox_config.toolbox_paths.is_empty() {
            let toolbox_paths: Vec<String> = self.toolbox_config.toolbox_paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            env.insert("AMP_TOOLBOX_PATHS".to_string(), toolbox_paths.join(":"));
            env.insert("AMP_ENABLE_TOOLBOXES".to_string(), "1".to_string());
        }

        // Use the existing env composer for additional processing
        let composer = ChatSpawnComposer;
        let result = composer.compose_env(env, None)?;

        Ok(ComposeResult { guard: result.guard })
    }

    /// Create runtime environment from environment variables and configuration
    pub fn from_environment() -> Result<Self> {
        let env_kind = if std::env::var("CI").is_ok() {
            EnvKind::CI
        } else if std::env::var("AMP_CLI_PATH").is_ok() || 
                  std::env::var("AMP_URL").map(|u| u.contains("localhost")).unwrap_or(false) {
            EnvKind::LocalDevelopment
        } else {
            EnvKind::Production
        };

        let amp_config = AmpConfig {
            server_url: std::env::var("AMP_URL").ok(),
            cli_path: std::env::var("AMP_CLI_PATH").ok().map(PathBuf::from),
            agent_mode: std::env::var("AMP_EXPERIMENTAL_AGENT_MODE").ok(),
        };

        let toolbox_config = if std::env::var("AMP_ENABLE_TOOLBOXES").is_ok() {
            let toolbox_paths = std::env::var("AMP_TOOLBOX_PATHS")
                .unwrap_or_default()
                .split(':')
                .filter(|s| !s.is_empty())
                .map(PathBuf::from)
                .collect();

            ToolboxConfig {
                toolbox_paths,
                max_file_count: std::env::var("AMP_TOOLBOX_MAX_FILES")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10000),
                max_total_size: std::env::var("AMP_TOOLBOX_MAX_MB")
                    .ok()
                    .and_then(|s| s.parse::<u64>().ok())
                    .map(|mb| mb * 1024 * 1024)
                    .unwrap_or(500 * 1024 * 1024),
            }
        } else {
            ToolboxConfig::default()
        };

        Ok(Self {
            env_kind,
            amp_config,
            agent_mode: None, // Will be set per session
            toolbox_config,
            worktree_path: None, // Will be set per session
        })
    }
}
