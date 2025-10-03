use std::collections::HashMap;
use anyhow::Result;
use crate::toolbox_resolver::ToolboxGuard;
use crate::toolbox_profiles::ToolboxProfile;

/// Result of environment composition containing optional toolbox guard
pub struct EnvComposeResult {
    pub guard: Option<ToolboxGuard>,
}

/// Strategy-based environment composer trait for different spawn contexts
pub trait EnvComposer {
    /// Compose the environment for the specific spawn strategy
    fn compose_env(&self, env: &mut HashMap<String, String>, profile: Option<&ToolboxProfile>) -> Result<EnvComposeResult>;
    
    /// Get the strategy name for logging/debugging
    fn strategy_name(&self) -> &'static str;
}

/// Environment composer for chat session spawning
pub struct ChatSpawnComposer;

impl EnvComposer for ChatSpawnComposer {
    fn compose_env(&self, env: &mut HashMap<String, String>, profile: Option<&ToolboxProfile>) -> Result<EnvComposeResult> {
        compose_runtime_env_internal(env, profile, SpawnContext::Chat)
    }
    
    fn strategy_name(&self) -> &'static str {
        "ChatSpawn"
    }
}

/// Environment composer for TUI terminal spawning (preparation for M1.7)
pub struct TuiSpawnComposer;

impl EnvComposer for TuiSpawnComposer {
    fn compose_env(&self, env: &mut HashMap<String, String>, profile: Option<&ToolboxProfile>) -> Result<EnvComposeResult> {
        // TUI spawning may need different environment setup in the future
        // For now, use the same core logic with TUI context
        compose_runtime_env_internal(env, profile, SpawnContext::Tui)
    }
    
    fn strategy_name(&self) -> &'static str {
        "TuiSpawn"
    }
}

/// Environment composer for external tool spawning  
pub struct ExternalToolSpawnComposer;

impl EnvComposer for ExternalToolSpawnComposer {
    fn compose_env(&self, env: &mut HashMap<String, String>, profile: Option<&ToolboxProfile>) -> Result<EnvComposeResult> {
        compose_runtime_env_internal(env, profile, SpawnContext::ExternalTool)
    }
    
    fn strategy_name(&self) -> &'static str {
        "ExternalToolSpawn"
    }
}

/// Context information for different spawn scenarios
#[derive(Debug, Clone, Copy)]
enum SpawnContext {
    Chat,
    Tui,
    ExternalTool,
}

/// Internal shared environment composition logic
fn compose_runtime_env_internal(
    env: &mut HashMap<String, String>, 
    profile: Option<&ToolboxProfile>,
    context: SpawnContext
) -> Result<EnvComposeResult> {
    use log::info;
    use std::path::PathBuf;
    use crate::toolbox_resolver::resolve_toolboxes;
    
    let mut guard: Option<ToolboxGuard> = None;

    // Set toolbox profile environment if provided
    if let Some(profile) = profile {
        let paths_str = profile.paths.join(if cfg!(windows) { ";" } else { ":" });
        env.insert("AMP_TOOLBOX_PATHS".into(), paths_str);
        env.insert("AMP_ACTIVE_TOOLBOX_PROFILE".into(), profile.name.clone());
    }

    // Check if toolboxes are enabled - respecting AMP_ENABLE_TOOLBOXES flag
    let toolboxes_enabled = env.get("AMP_ENABLE_TOOLBOXES")
        .map(|v| v != "0" && v.to_lowercase() != "false")
        .unwrap_or(true); // Default to enabled if not explicitly disabled
    
    if !toolboxes_enabled {
        return Ok(EnvComposeResult { guard: None });
    }

    // Toolboxes are enabled, proceed with path resolution
    let paths = env.get("AMP_TOOLBOX_PATHS").cloned();

    if let Some(paths_str) = paths {
        let roots: Vec<PathBuf> = split_paths(&paths_str)
            .into_iter()
            .map(PathBuf::from)
            .collect();
            
        if !roots.is_empty() {
            let mut resolved = resolve_toolboxes(&roots, false)?;
            
            // Compose PATH with toolbox bin directory
            let prev_path = env.get("PATH").cloned().unwrap_or_default();
            let new_path = if prev_path.is_empty() {
                resolved.bin.to_string_lossy().to_string()
            } else {
                format!("{}:{}", resolved.bin.to_string_lossy(), prev_path)
            };
            
            env.insert("PATH".into(), new_path);
            env.insert("AMP_TOOLBOX".into(), resolved.root.to_string_lossy().to_string());
            
            // Context-specific logging
            let context_str = match context {
                SpawnContext::Chat => "chat",
                SpawnContext::Tui => "tui",
                SpawnContext::ExternalTool => "external_tool",
            };
            
            if let Some(profile_name) = env.get("AMP_ACTIVE_TOOLBOX_PROFILE") {
                info!("env_composer.{}: toolbox profile '{}' enabled files_count={} bytes={} copy_mode={}", 
                      context_str, profile_name, resolved.manifest.files_count, resolved.manifest.bytes_total, resolved.manifest.copy_mode);
            } else {
                info!("env_composer.{}: toolbox enabled files_count={} bytes={} copy_mode={}", 
                      context_str, resolved.manifest.files_count, resolved.manifest.bytes_total, resolved.manifest.copy_mode);
            }
            
            guard = resolved.take_guard();
        }
    }

    Ok(EnvComposeResult { guard })
}

/// Utility function to split paths by platform-appropriate separators
pub fn split_paths(s: &str) -> Vec<String> {
    if cfg!(windows) {
        s.split(';').map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect()
    } else {
        // Support both ':' and ',' separators for convenience
        s.split(|c| c == ':' || c == ',').map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect()
    }
}

/// Factory function to create the appropriate composer for different spawn contexts
pub fn create_composer(context: &str) -> Box<dyn EnvComposer> {
    match context.to_lowercase().as_str() {
        "chat" => Box::new(ChatSpawnComposer),
        "tui" => Box::new(TuiSpawnComposer),
        "external" | "external_tool" => Box::new(ExternalToolSpawnComposer),
        _ => Box::new(ChatSpawnComposer), // Default to chat spawn
    }
}

/// Helper function for direct usage of environment composition with specific strategy
/// This can be used in preparation for M1.7 TUI work
pub fn compose_env_with_strategy(
    env: &mut HashMap<String, String>,
    profile: Option<&ToolboxProfile>,
    strategy: &str,
) -> Result<EnvComposeResult> {
    let composer = create_composer(strategy);
    composer.compose_env(env, profile)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_factory_creates_correct_composer() {
        let chat_composer = create_composer("chat");
        assert_eq!(chat_composer.strategy_name(), "ChatSpawn");
        
        let tui_composer = create_composer("tui");
        assert_eq!(tui_composer.strategy_name(), "TuiSpawn");
        
        let external_composer = create_composer("external");
        assert_eq!(external_composer.strategy_name(), "ExternalToolSpawn");
        
        let default_composer = create_composer("unknown");
        assert_eq!(default_composer.strategy_name(), "ChatSpawn");
    }
    
    #[test] 
    fn test_split_paths_platform_specific() {
        if cfg!(windows) {
            let paths = split_paths("C:\\path1;C:\\path2;C:\\path3");
            assert_eq!(paths, vec!["C:\\path1", "C:\\path2", "C:\\path3"]);
        } else {
            let paths = split_paths("/path1:/path2,/path3");
            assert_eq!(paths, vec!["/path1", "/path2", "/path3"]);
        }
    }
    
    #[test]
    fn test_empty_env_composition() {
        let composer = ChatSpawnComposer;
        let mut env = HashMap::new();
        
        let result = composer.compose_env(&mut env, None).unwrap();
        assert!(result.guard.is_none());
        assert!(!env.contains_key("AMP_TOOLBOX"));
    }
}
