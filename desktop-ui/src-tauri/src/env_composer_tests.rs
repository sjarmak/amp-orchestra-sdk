#[cfg(test)]
mod tests {
    use crate::env_composer::*;
    use crate::toolbox_profiles::ToolboxProfile;
    use std::collections::HashMap;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    fn make_exec(p: &std::path::Path) {
        let mut perms = fs::metadata(p).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(p, perms).unwrap();
    }

    #[test]
    fn test_chat_spawn_composer_strategy_name() {
        let composer = ChatSpawnComposer;
        assert_eq!(composer.strategy_name(), "ChatSpawn");
    }

    #[test]
    fn test_tui_spawn_composer_strategy_name() {
        let composer = TuiSpawnComposer;
        assert_eq!(composer.strategy_name(), "TuiSpawn");
    }

    #[test]
    fn test_external_tool_spawn_composer_strategy_name() {
        let composer = ExternalToolSpawnComposer;
        assert_eq!(composer.strategy_name(), "ExternalToolSpawn");
    }

    #[test]
    fn test_empty_env_no_toolboxes_chat_spawn() {
        let composer = ChatSpawnComposer;
        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());

        let result = composer.compose_env(&mut env, None).unwrap();
        
        assert!(result.guard.is_none());
        assert!(!env.contains_key("AMP_TOOLBOX"));
        assert_eq!(env.get("PATH").unwrap(), "/usr/bin:/bin");
    }

    #[test]
    fn test_empty_env_no_toolboxes_tui_spawn() {
        let composer = TuiSpawnComposer;
        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());

        let result = composer.compose_env(&mut env, None).unwrap();
        
        assert!(result.guard.is_none());
        assert!(!env.contains_key("AMP_TOOLBOX"));
        assert_eq!(env.get("PATH").unwrap(), "/usr/bin:/bin");
    }

    #[test]
    fn test_empty_env_no_toolboxes_external_tool_spawn() {
        let composer = ExternalToolSpawnComposer;
        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());

        let result = composer.compose_env(&mut env, None).unwrap();
        
        assert!(result.guard.is_none());
        assert!(!env.contains_key("AMP_TOOLBOX"));
        assert_eq!(env.get("PATH").unwrap(), "/usr/bin:/bin");
    }

    #[test]
    fn test_chat_spawn_with_toolbox() {
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = tmp.path().join("test_toolbox");
        fs::create_dir_all(toolbox.join("bin")).unwrap();
        fs::write(toolbox.join("bin/test_tool"), "#!/bin/bash\necho test").unwrap();
        make_exec(&toolbox.join("bin/test_tool"));

        let composer = ChatSpawnComposer;
        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());
        env.insert("AMP_TOOLBOX_PATHS".into(), toolbox.to_string_lossy().to_string());

        let result = composer.compose_env(&mut env, None).unwrap();
        
        assert!(result.guard.is_some());
        assert!(env.contains_key("AMP_TOOLBOX"));
        
        let path = env.get("PATH").unwrap();
        assert!(path.contains("/bin:"));
        assert!(path.contains("/usr/bin:/bin"));
    }

    #[test]
    fn test_tui_spawn_with_toolbox() {
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = tmp.path().join("test_toolbox");
        fs::create_dir_all(toolbox.join("bin")).unwrap();
        fs::write(toolbox.join("bin/test_tool"), "#!/bin/bash\necho test").unwrap();
        make_exec(&toolbox.join("bin/test_tool"));

        let composer = TuiSpawnComposer;
        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());
        env.insert("AMP_TOOLBOX_PATHS".into(), toolbox.to_string_lossy().to_string());

        let result = composer.compose_env(&mut env, None).unwrap();
        
        assert!(result.guard.is_some());
        assert!(env.contains_key("AMP_TOOLBOX"));
        
        let path = env.get("PATH").unwrap();
        assert!(path.contains("/bin:"));
        assert!(path.contains("/usr/bin:/bin"));
    }

    #[test]
    fn test_external_tool_spawn_with_toolbox() {
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = tmp.path().join("test_toolbox");
        fs::create_dir_all(toolbox.join("bin")).unwrap();
        fs::write(toolbox.join("bin/test_tool"), "#!/bin/bash\necho test").unwrap();
        make_exec(&toolbox.join("bin/test_tool"));

        let composer = ExternalToolSpawnComposer;
        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());
        env.insert("AMP_TOOLBOX_PATHS".into(), toolbox.to_string_lossy().to_string());

        let result = composer.compose_env(&mut env, None).unwrap();
        
        assert!(result.guard.is_some());
        assert!(env.contains_key("AMP_TOOLBOX"));
        
        let path = env.get("PATH").unwrap();
        assert!(path.contains("/bin:"));
        assert!(path.contains("/usr/bin:/bin"));
    }

    #[test]
    fn test_chat_spawn_with_toolbox_profile() {
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = tmp.path().join("profile_toolbox");
        fs::create_dir_all(toolbox.join("bin")).unwrap();
        fs::write(toolbox.join("bin/profile_tool"), "#!/bin/bash\necho profile").unwrap();
        make_exec(&toolbox.join("bin/profile_tool"));

        let profile = ToolboxProfile {
            id: 1,
            name: "test_profile".to_string(),
            created_at: "2023-01-01T00:00:00Z".to_string(),
            paths: vec![toolbox.to_string_lossy().to_string()],
        };

        let composer = ChatSpawnComposer;
        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());

        let result = composer.compose_env(&mut env, Some(&profile)).unwrap();
        
        assert!(result.guard.is_some());
        assert!(env.contains_key("AMP_TOOLBOX"));
        assert_eq!(env.get("AMP_ACTIVE_TOOLBOX_PROFILE").unwrap(), "test_profile");
        assert_eq!(env.get("AMP_TOOLBOX_PATHS").unwrap(), &toolbox.to_string_lossy().to_string());
        
        let path = env.get("PATH").unwrap();
        assert!(path.contains("/bin:"));
        assert!(path.contains("/usr/bin:/bin"));
    }

    #[test]
    fn test_multi_path_profile() {
        let tmp = tempfile::tempdir().unwrap();
        
        let toolbox1 = tmp.path().join("toolbox1");
        let toolbox2 = tmp.path().join("toolbox2");
        
        fs::create_dir_all(toolbox1.join("bin")).unwrap();
        fs::create_dir_all(toolbox2.join("bin")).unwrap();
        
        fs::write(toolbox1.join("bin/tool1"), "#!/bin/bash\necho tool1").unwrap();
        fs::write(toolbox2.join("bin/tool2"), "#!/bin/bash\necho tool2").unwrap();
        
        make_exec(&toolbox1.join("bin/tool1"));
        make_exec(&toolbox2.join("bin/tool2"));

        let profile = ToolboxProfile {
            id: 2,
            name: "multi_path_profile".to_string(),
            created_at: "2023-01-01T00:00:00Z".to_string(),
            paths: vec![
                toolbox1.to_string_lossy().to_string(),
                toolbox2.to_string_lossy().to_string()
            ],
        };

        let composer = ChatSpawnComposer;
        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());

        let result = composer.compose_env(&mut env, Some(&profile)).unwrap();
        
        assert!(result.guard.is_some());
        assert!(env.contains_key("AMP_TOOLBOX"));
        assert_eq!(env.get("AMP_ACTIVE_TOOLBOX_PROFILE").unwrap(), "multi_path_profile");
        
        let expected_paths = if cfg!(windows) {
            format!("{};{}", toolbox1.to_string_lossy(), toolbox2.to_string_lossy())
        } else {
            format!("{}:{}", toolbox1.to_string_lossy(), toolbox2.to_string_lossy())
        };
        assert_eq!(env.get("AMP_TOOLBOX_PATHS").unwrap(), &expected_paths);
    }

    #[test]
    fn test_factory_function() {
        let chat_composer = create_composer("chat");
        assert_eq!(chat_composer.strategy_name(), "ChatSpawn");

        let tui_composer = create_composer("TUI");
        assert_eq!(tui_composer.strategy_name(), "TuiSpawn");

        let external_composer = create_composer("external_tool");
        assert_eq!(external_composer.strategy_name(), "ExternalToolSpawn");

        let external_composer2 = create_composer("external");
        assert_eq!(external_composer2.strategy_name(), "ExternalToolSpawn");

        let default_composer = create_composer("unknown_strategy");
        assert_eq!(default_composer.strategy_name(), "ChatSpawn");
    }

    #[test]
    fn test_path_splitting() {
        if cfg!(windows) {
            let paths = split_paths("C:\\path1;C:\\path2;;C:\\path3;");
            assert_eq!(paths, vec!["C:\\path1", "C:\\path2", "C:\\path3"]);
        } else {
            let paths = split_paths("/path1:/path2,/path3::,/path4");
            assert_eq!(paths, vec!["/path1", "/path2", "/path3", "/path4"]);
        }
    }

    #[test]
    fn test_empty_path_splitting() {
        let empty_paths = split_paths("");
        assert_eq!(empty_paths, Vec::<String>::new());

        let only_separators = if cfg!(windows) {
            split_paths(";;;")
        } else {
            split_paths(":::")
        };
        assert_eq!(only_separators, Vec::<String>::new());
    }

    #[test] 
    fn test_path_precedence_in_composition() {
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = tmp.path().join("precedence_toolbox");
        fs::create_dir_all(toolbox.join("bin")).unwrap();
        fs::write(toolbox.join("bin/ls"), "#!/bin/bash\necho 'toolbox ls'").unwrap();
        make_exec(&toolbox.join("bin/ls"));

        let composer = ChatSpawnComposer;
        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());
        env.insert("AMP_TOOLBOX_PATHS".into(), toolbox.to_string_lossy().to_string());

        let result = composer.compose_env(&mut env, None).unwrap();
        
        assert!(result.guard.is_some());
        
        let path = env.get("PATH").unwrap();
        let toolbox_bin_path = format!("{}/bin", env.get("AMP_TOOLBOX").unwrap());
        
        // Toolbox bin should come first in PATH
        assert!(path.starts_with(&toolbox_bin_path));
        assert!(path.contains("/usr/bin"));
        assert!(path.contains("/bin"));
        
        let toolbox_pos = path.find(&toolbox_bin_path).unwrap();
        let system_pos = path.find("/usr/bin").unwrap();
        assert!(toolbox_pos < system_pos, "Toolbox path should precede system paths");
    }

    #[test]
    fn test_toolboxes_disabled_flag() {
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = tmp.path().join("disabled_toolbox");
        fs::create_dir_all(toolbox.join("bin")).unwrap();
        fs::write(toolbox.join("bin/disabled_tool"), "#!/bin/bash\necho disabled").unwrap();
        make_exec(&toolbox.join("bin/disabled_tool"));

        let composers: Vec<Box<dyn EnvComposer>> = vec![
            Box::new(ChatSpawnComposer),
            Box::new(TuiSpawnComposer), 
            Box::new(ExternalToolSpawnComposer),
        ];

        for composer in composers {
            let mut env = HashMap::new();
            env.insert("PATH".into(), "/usr/bin:/bin".to_string());
            env.insert("AMP_ENABLE_TOOLBOXES".into(), "0".into());
            env.insert("AMP_TOOLBOX_PATHS".into(), toolbox.to_string_lossy().to_string());

            let result = composer.compose_env(&mut env, None).unwrap();
            
            // When disabled, should have no guard and no AMP_TOOLBOX
            assert!(result.guard.is_none());
            assert!(!env.contains_key("AMP_TOOLBOX"));
            assert_eq!(env.get("PATH").unwrap(), "/usr/bin:/bin");
        }
    }

    #[test]
    fn test_toolboxes_disabled_flag_false_string() {
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = tmp.path().join("disabled_toolbox");
        fs::create_dir_all(toolbox.join("bin")).unwrap();
        fs::write(toolbox.join("bin/disabled_tool"), "#!/bin/bash\necho disabled").unwrap();
        make_exec(&toolbox.join("bin/disabled_tool"));

        let composer = ChatSpawnComposer;
        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());
        env.insert("AMP_ENABLE_TOOLBOXES".into(), "false".into());
        env.insert("AMP_TOOLBOX_PATHS".into(), toolbox.to_string_lossy().to_string());

        let result = composer.compose_env(&mut env, None).unwrap();
        
        // When disabled with "false", should have no guard and no AMP_TOOLBOX
        assert!(result.guard.is_none());
        assert!(!env.contains_key("AMP_TOOLBOX"));
        assert_eq!(env.get("PATH").unwrap(), "/usr/bin:/bin");
    }

    #[test]
    fn test_all_composers_produce_consistent_results() {
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = tmp.path().join("consistent_toolbox");
        fs::create_dir_all(toolbox.join("bin")).unwrap();
        fs::write(toolbox.join("bin/consistent_tool"), "#!/bin/bash\necho consistent").unwrap();
        make_exec(&toolbox.join("bin/consistent_tool"));

        let composers: Vec<Box<dyn EnvComposer>> = vec![
            Box::new(ChatSpawnComposer),
            Box::new(TuiSpawnComposer), 
            Box::new(ExternalToolSpawnComposer),
        ];

        let mut results = Vec::new();
        
        for composer in composers {
            let mut env = HashMap::new();
            env.insert("PATH".into(), "/usr/bin:/bin".to_string());
            env.insert("AMP_TOOLBOX_PATHS".into(), toolbox.to_string_lossy().to_string());

            let result = composer.compose_env(&mut env, None).unwrap();
            
            // All should have toolbox guard and environment setup
            assert!(result.guard.is_some());
            assert!(env.contains_key("AMP_TOOLBOX"));
            
            let path = env.get("PATH").unwrap().clone();
            let toolbox_env = env.get("AMP_TOOLBOX").unwrap().clone();
            
            results.push((path, toolbox_env));
        }

        // All results should be identical (same environment composition logic)
        let first_result = &results[0];
        for result in &results[1..] {
            assert_eq!(result.0, first_result.0, "PATH should be identical across all composers");
            assert_eq!(result.1, first_result.1, "AMP_TOOLBOX should be identical across all composers");
        }
    }
}
