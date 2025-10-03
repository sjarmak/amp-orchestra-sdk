#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    use crate::runtime_env::compose_runtime_env;
    use crate::toolbox_resolver::resolve_toolboxes;

    fn make_exec(p: &std::path::Path) {
        let mut perms = fs::metadata(p).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(p, perms).unwrap();
    }

    #[test]
    fn compose_sets_env_and_path() {
        let tmp = tempfile::tempdir().unwrap();
        let a = tmp.path().join("a");
        fs::create_dir_all(a.join("bin")).unwrap();
        fs::write(a.join("bin/hello"), b"#!/usr/bin/env bash\necho hi\n").unwrap();
        make_exec(&a.join("bin/hello"));

        // Ensure resolver works
        let resolved = resolve_toolboxes(&[a.clone()], true).unwrap();
        assert!(resolved.bin.join("hello").exists());

        let mut env = HashMap::new();
        env.insert("PATH".into(), std::env::var("PATH").unwrap_or_default());
        env.insert("AMP_ENABLE_TOOLBOXES".into(), "1".into());
        env.insert("AMP_TOOLBOX_PATHS".into(), a.to_string_lossy().to_string());
        let _compose = compose_runtime_env(&mut env).unwrap();
        let tb = env.get("AMP_TOOLBOX").cloned();
        assert!(tb.is_some());
        let path = env.get("PATH").cloned().unwrap();
        assert!(path.split(':').next().unwrap().ends_with("/bin"));

        // Shim integration: spawn fake CLI and assert env
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let shim = std::path::Path::new(manifest_dir)
            .join("../../tools/fake-amp-cli.mjs")
            .canonicalize()
            .unwrap();
        let output = std::process::Command::new("node")
            .arg(shim)
            .arg("--test")
            .env_clear()
            .envs(&env)
            .output()
            .unwrap();
        assert!(output.status.success());
        let text = String::from_utf8_lossy(&output.stdout);
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["env"]["AMP_TOOLBOX"], serde_json::Value::String(tb.unwrap()));
        let shim_path = v["env"]["PATH"].as_str().unwrap().to_string();
        assert!(shim_path.starts_with(path.split(':').next().unwrap()));
    }

    #[test]
    fn integration_toolbox_multi_root_precedence() {
        // Reset any lingering env vars
        std::env::remove_var("AMP_TOOLBOX_MAX_FILES");
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        
        let tmp = tempfile::tempdir().unwrap();
        
        // Create toolbox A with some tools
        let toolbox_a = tmp.path().join("toolbox_a");
        fs::create_dir_all(toolbox_a.join("bin")).unwrap();
        fs::write(toolbox_a.join("bin/shared_tool"), "#!/bin/bash\necho 'version A'").unwrap();
        fs::write(toolbox_a.join("bin/tool_a"), "#!/bin/bash\necho 'exclusive A'").unwrap();
        make_exec(&toolbox_a.join("bin/shared_tool"));
        make_exec(&toolbox_a.join("bin/tool_a"));
        
        // Create toolbox B with overlapping and unique tools
        let toolbox_b = tmp.path().join("toolbox_b");
        fs::create_dir_all(toolbox_b.join("bin")).unwrap();
        fs::write(toolbox_b.join("bin/shared_tool"), "#!/bin/bash\necho 'version B'").unwrap();
        fs::write(toolbox_b.join("bin/tool_b"), "#!/bin/bash\necho 'exclusive B'").unwrap();
        make_exec(&toolbox_b.join("bin/shared_tool"));
        make_exec(&toolbox_b.join("bin/tool_b"));

        // Set up environment with both toolboxes
        let mut env = HashMap::new();
        env.insert("PATH".into(), std::env::var("PATH").unwrap_or_default());
        env.insert("AMP_ENABLE_TOOLBOXES".into(), "1".into());
        let toolbox_paths = format!("{}:{}", 
            toolbox_a.to_string_lossy(), 
            toolbox_b.to_string_lossy()
        );
        env.insert("AMP_TOOLBOX_PATHS".into(), toolbox_paths);
        
        let _compose = compose_runtime_env(&mut env).unwrap();
        
        // Verify environment is set correctly
        let toolbox_env = env.get("AMP_TOOLBOX").expect("AMP_TOOLBOX should be set");
        let _path_env = env.get("PATH").expect("PATH should be set");
        
        // Use fake CLI shim to verify environment
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let shim = std::path::Path::new(manifest_dir)
            .join("../../tools/fake-amp-cli.mjs")
            .canonicalize()
            .unwrap();
            
        let output = std::process::Command::new("node")
            .arg(shim)
            .arg("--test-toolbox")
            .env_clear()
            .envs(&env)
            .output()
            .unwrap();
            
        assert!(output.status.success());
        let text = String::from_utf8_lossy(&output.stdout);
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        
        // Verify the shim sees the toolbox environment
        assert_eq!(v["env"]["AMP_TOOLBOX"].as_str().unwrap(), toolbox_env);
        
        let shim_path = v["env"]["PATH"].as_str().unwrap();
        let toolbox_bin_dir = format!("{}/bin", toolbox_env);
        assert!(shim_path.starts_with(&toolbox_bin_dir), 
            "PATH should start with toolbox bin dir. Expected to start with '{}', got '{}'", 
            toolbox_bin_dir, shim_path);
        
        // Verify last-write-wins: toolbox B should override shared_tool
        let shared_tool_path = std::path::Path::new(toolbox_env).join("bin/shared_tool");
        let shared_tool_content = fs::read_to_string(&shared_tool_path).unwrap();
        assert!(shared_tool_content.contains("version B"), 
            "shared_tool should contain 'version B', got: {}", shared_tool_content);
        
        // Verify both unique tools exist
        let tool_a_path = std::path::Path::new(toolbox_env).join("bin/tool_a");
        let tool_b_path = std::path::Path::new(toolbox_env).join("bin/tool_b");
        assert!(tool_a_path.exists(), "tool_a should exist in merged toolbox");
        assert!(tool_b_path.exists(), "tool_b should exist in merged toolbox");
    }

    #[test] 
    fn integration_toolbox_disabled() {
        let tmp = tempfile::tempdir().unwrap();
        
        // Create a toolbox with tools
        let toolbox = tmp.path().join("toolbox");
        fs::create_dir_all(toolbox.join("bin")).unwrap();
        fs::write(toolbox.join("bin/test_tool"), "#!/bin/bash\necho test").unwrap();
        make_exec(&toolbox.join("bin/test_tool"));

        // Set up environment with toolboxes DISABLED
        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());
        env.insert("AMP_ENABLE_TOOLBOXES".into(), "0".into());
        env.insert("AMP_TOOLBOX_PATHS".into(), toolbox.to_string_lossy().to_string());
        
        let original_path = env.get("PATH").unwrap().clone();
        let _compose = compose_runtime_env(&mut env).unwrap();
        
        // When disabled, AMP_TOOLBOX should not be set and PATH should remain unchanged
        assert!(env.get("AMP_TOOLBOX").is_none(), "AMP_TOOLBOX should not be set when disabled");
        assert_eq!(env.get("PATH").unwrap(), &original_path, "PATH should be unchanged when toolboxes disabled");
        
        // Verify with shim
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let shim = std::path::Path::new(manifest_dir)
            .join("../../tools/fake-amp-cli.mjs")
            .canonicalize()
            .unwrap();
            
        let output = std::process::Command::new("node")
            .arg(shim)
            .arg("--test-disabled")
            .env_clear()
            .envs(&env)
            // Need to preserve some PATH for node to be found
            .env("PATH", &format!("/usr/bin:/bin:/usr/local/bin:{}", std::env::var("PATH").unwrap_or_default()))
            .output()
            .unwrap();
            
        assert!(output.status.success());
        let text = String::from_utf8_lossy(&output.stdout);
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        
        // Shim should see null AMP_TOOLBOX
        assert_eq!(v["env"]["AMP_TOOLBOX"], serde_json::Value::Null);
        // PATH should start with the basic paths we set, but can contain more for node to work
        let shim_path = v["env"]["PATH"].as_str().unwrap();
        assert!(shim_path.starts_with("/usr/bin:/bin:/usr/local/bin"));
    }

    #[test]
    fn integration_toolbox_path_prepending() {
        // Reset any lingering env vars
        std::env::remove_var("AMP_TOOLBOX_MAX_FILES");
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        
        let tmp = tempfile::tempdir().unwrap();
        
        // Create a toolbox with a tool that shadows a system command
        let toolbox = tmp.path().join("custom_toolbox");
        fs::create_dir_all(toolbox.join("bin")).unwrap();
        fs::write(toolbox.join("bin/ls"), "#!/bin/bash\necho 'custom ls from toolbox'").unwrap();
        make_exec(&toolbox.join("bin/ls"));

        let mut env = HashMap::new();
        env.insert("PATH".into(), "/usr/bin:/bin".to_string());
        env.insert("AMP_ENABLE_TOOLBOXES".into(), "true".into());
        env.insert("AMP_TOOLBOX_PATHS".into(), toolbox.to_string_lossy().to_string());
        
        let _compose = compose_runtime_env(&mut env).unwrap();
        
        let toolbox_env = env.get("AMP_TOOLBOX").expect("AMP_TOOLBOX should be set");
        let path_env = env.get("PATH").expect("PATH should be set");
        
        // PATH should start with the toolbox bin directory
        let expected_bin_start = format!("{}/bin:", toolbox_env);
        assert!(path_env.starts_with(&expected_bin_start), 
            "PATH should start with toolbox bin dir. Expected to start with '{}', got '{}'", 
            expected_bin_start, path_env);
        
        // PATH should still contain the original system paths
        assert!(path_env.contains("/usr/bin"), "PATH should still contain /usr/bin");
        assert!(path_env.contains("/bin"), "PATH should still contain /bin");
        
        // The toolbox bin should come first (before system paths)
        let toolbox_bin_pos = path_env.find(&format!("{}/bin", toolbox_env)).unwrap();
        let usr_bin_pos = path_env.find("/usr/bin").unwrap();
        assert!(toolbox_bin_pos < usr_bin_pos, 
            "Toolbox bin should come before /usr/bin in PATH");
    }
}
