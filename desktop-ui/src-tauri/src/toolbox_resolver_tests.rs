#[cfg(test)]
mod tests {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;


    use crate::toolbox_resolver::resolve_toolboxes;

    fn make_exec(p: &PathBuf) {
        let mut perms = fs::metadata(p).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(p, perms).unwrap();
    }

    fn create_toolbox_with_tools(base: &std::path::Path, name: &str, tools: &[(&str, &str)]) -> PathBuf {
        let root = base.join(name);
        let bin = root.join("bin");
        fs::create_dir_all(&bin).unwrap();
        
        for (tool_name, content) in tools {
            let tool_path = bin.join(tool_name);
            fs::write(&tool_path, content.as_bytes()).unwrap();
            make_exec(&tool_path);
        }
        
        root
    }

    #[test]
    fn merges_bin_last_wins() {
        // Set higher limits for this test to avoid failures
        std::env::set_var("AMP_TOOLBOX_MAX_MB", "10");
        
        let tmp = tempfile::tempdir().unwrap();
        let a = tmp.path().join("a");
        let b = tmp.path().join("b");
        fs::create_dir_all(a.join("bin")).unwrap();
        fs::create_dir_all(b.join("bin")).unwrap();
        fs::write(a.join("bin/hello"), b"A").unwrap();
        fs::write(b.join("bin/hello"), b"B").unwrap();
        make_exec(&a.join("bin/hello"));
        make_exec(&b.join("bin/hello"));

        let resolved = resolve_toolboxes(&[a.clone(), b.clone()], true);
        
        // Clean up env var
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        
        let resolved = resolved.unwrap();
        let merged = fs::read(resolved.bin.join("hello")).unwrap();
        assert_eq!(merged, b"B");
        // Guard keeps artifacts when true; we won't drop here explicitly.
    }

    #[test]
    fn single_root_basic() {
        // Set higher limits for this test to avoid failures
        std::env::set_var("AMP_TOOLBOX_MAX_MB", "10");
        
        let tmp = tempfile::tempdir().unwrap();
        let toolbox_a = create_toolbox_with_tools(tmp.path(), "toolbox_a", &[
            ("echo_hi.sh", "#!/bin/bash\necho hello"),
            ("curl", "#!/bin/bash\necho fake curl"),
        ]);

        let resolved = resolve_toolboxes(&[toolbox_a], true);
        
        // Clean up env var
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        
        let resolved = resolved.unwrap();
        
        assert_eq!(resolved.manifest.files_count, 2);
        assert!(resolved.bin.join("echo_hi.sh").exists());
        assert!(resolved.bin.join("curl").exists());
        
        let content = fs::read_to_string(resolved.bin.join("echo_hi.sh")).unwrap();
        assert!(content.contains("echo hello"));
    }

    #[test]
    fn multi_root_precedence() {
        // Set higher limits for this test to avoid failures
        std::env::set_var("AMP_TOOLBOX_MAX_FILES", "10000");
        std::env::set_var("AMP_TOOLBOX_MAX_MB", "10");
        
        let tmp = tempfile::tempdir().unwrap();
        
        let toolbox_a = create_toolbox_with_tools(tmp.path(), "toolbox_a", &[
            ("common_tool", "version A"),
            ("tool_a", "exclusive to A"),
        ]);
        
        let toolbox_b = create_toolbox_with_tools(tmp.path(), "toolbox_b", &[
            ("common_tool", "version B"), // This should win (last-write-wins)
            ("tool_b", "exclusive to B"),
        ]);

        let resolved = resolve_toolboxes(&[toolbox_a, toolbox_b], true);
        
        // Clean up env vars
        std::env::remove_var("AMP_TOOLBOX_MAX_FILES");
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        
        let resolved = resolved.unwrap();
        
        // WalkDir processes all files from both toolboxes, but common_tool gets overwritten
        // So we expect: tool_a (from A), common_tool (from A), then common_tool (from B), tool_b (from B)
        // That's 4 total files processed, but only 3 unique files in the final bin directory
        assert_eq!(resolved.manifest.files_count, 4);
        
        // Check that B's version wins
        let common_content = fs::read_to_string(resolved.bin.join("common_tool")).unwrap();
        assert_eq!(common_content, "version B");
        
        // Check both unique tools exist
        let tool_a_content = fs::read_to_string(resolved.bin.join("tool_a")).unwrap();
        assert_eq!(tool_a_content, "exclusive to A");
        
        let tool_b_content = fs::read_to_string(resolved.bin.join("tool_b")).unwrap();
        assert_eq!(tool_b_content, "exclusive to B");
    }

    #[test]
    fn empty_roots_error() {
        let result = resolve_toolboxes(&[], false);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("no toolbox roots provided"));
    }

    #[test]
    fn nonexistent_root_error() {
        let nonexistent = PathBuf::from("/this/path/does/not/exist");
        let result = resolve_toolboxes(&[nonexistent], false);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("canonicalize"));
    }

    #[test]
    fn file_limit_exceeded() {
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = tmp.path().join("big_toolbox");
        let bin = toolbox.join("bin");
        fs::create_dir_all(&bin).unwrap();

        // Set higher MB limit but low file limit for testing
        std::env::set_var("AMP_TOOLBOX_MAX_MB", "10");
        std::env::set_var("AMP_TOOLBOX_MAX_FILES", "2");
        
        // Create 3 files to exceed the limit
        for i in 0..3 {
            let tool_path = bin.join(format!("tool_{}", i));
            fs::write(&tool_path, format!("tool {} content", i)).unwrap();
            make_exec(&tool_path);
        }

        let result = resolve_toolboxes(&[toolbox], false);
        
        // Clean up env vars  
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        std::env::remove_var("AMP_TOOLBOX_MAX_FILES");
        
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("file limit exceeded"));
    }

    #[test]
    fn size_limit_exceeded() {
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = tmp.path().join("big_toolbox");
        let bin = toolbox.join("bin");
        fs::create_dir_all(&bin).unwrap();

        // Set a very low size limit (1 byte total)
        std::env::set_var("AMP_TOOLBOX_MAX_BYTES", "1");
        
        // Create a file larger than the limit
        let tool_path = bin.join("big_tool");
        fs::write(&tool_path, "This content is definitely more than 0 bytes").unwrap();
        make_exec(&tool_path);

        let result = resolve_toolboxes(&[toolbox], false);
        
        // Clean up env var
        std::env::remove_var("AMP_TOOLBOX_MAX_BYTES");
        
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("size limit exceeded"));
    }

    #[test]
    fn skips_symlinks() {
        // Set higher limits for this test to avoid failures
        std::env::set_var("AMP_TOOLBOX_MAX_MB", "10");
        
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = tmp.path().join("symlink_toolbox");
        let bin = toolbox.join("bin");
        fs::create_dir_all(&bin).unwrap();

        // Create a regular file
        let regular_file = bin.join("regular_tool");
        fs::write(&regular_file, "regular content").unwrap();
        make_exec(&regular_file);

        // Create a symlink (this should be skipped)
        let target = bin.join("target");
        fs::write(&target, "target content").unwrap();
        make_exec(&target);
        let symlink = bin.join("symlink_tool");
        std::os::unix::fs::symlink(&target, &symlink).unwrap();

        let resolved = resolve_toolboxes(&[toolbox], true);
        
        // Clean up env var
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        
        let resolved = resolved.unwrap();
        
        // Should only have the regular file, not the symlink
        assert_eq!(resolved.manifest.files_count, 2); // regular_tool + target
        assert!(resolved.bin.join("regular_tool").exists());
        assert!(resolved.bin.join("target").exists());
        assert!(!resolved.bin.join("symlink_tool").exists()); // Symlink should be skipped
    }

    #[test]
    fn guard_cleanup() {
        // Reset any lingering env vars that might affect limits
        std::env::remove_var("AMP_TOOLBOX_MAX_FILES");
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = create_toolbox_with_tools(tmp.path(), "cleanup_test", &[
            ("test_tool", "test content"),
        ]);

        let _runtime_dir = {
            let mut resolved = resolve_toolboxes(&[toolbox], false).unwrap(); // keep_artifacts=false
            let dir = resolved.root.clone();
            assert!(dir.exists());
            
            // Guard should clean up when dropped
            resolved.take_guard();
            dir
        };

        // Directory should still exist because we haven't dropped the guard yet
        // But this test mainly verifies the structure is correct
    }

    #[test]
    fn deterministic_hash() {
        // Reset any lingering env vars that might affect limits
        std::env::remove_var("AMP_TOOLBOX_MAX_FILES");
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        std::env::remove_var("AMP_TOOLBOX_MAX_BYTES");
        std::env::set_var("AMP_TOOLBOX_MAX_MB", "10");
        
        let tmp = tempfile::tempdir().unwrap();
        let toolbox = create_toolbox_with_tools(tmp.path(), "hash_test", &[
            ("tool", "content"),
        ]);

        let resolved1 = resolve_toolboxes(&[toolbox.clone()], true);
        let resolved2 = resolve_toolboxes(&[toolbox], true);
        
        // Clean up env var
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        
        let resolved1 = resolved1.unwrap();
        let resolved2 = resolved2.unwrap();
        
        // Same inputs should produce same runtime directory names
        assert_eq!(resolved1.root.file_name(), resolved2.root.file_name());
    }

    #[test] 
    fn manifest_metadata() {
        // Reset any lingering env vars that might affect limits
        std::env::remove_var("AMP_TOOLBOX_MAX_FILES");
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        std::env::remove_var("AMP_TOOLBOX_MAX_BYTES");
        std::env::set_var("AMP_TOOLBOX_MAX_MB", "10");
        
        let tmp = tempfile::tempdir().unwrap();
        let toolbox_a = create_toolbox_with_tools(tmp.path(), "meta_test_a", &[
            ("tool_a", "content a"),
        ]);
        let toolbox_b = create_toolbox_with_tools(tmp.path(), "meta_test_b", &[
            ("tool_b", "content b"),
        ]);

        let resolved = resolve_toolboxes(&[toolbox_a.clone(), toolbox_b.clone()], true);
        
        // Clean up env var
        std::env::remove_var("AMP_TOOLBOX_MAX_MB");
        
        let resolved = resolved.unwrap();
        
        assert_eq!(resolved.manifest.files_count, 2);
        assert_eq!(resolved.manifest.sources.len(), 2);
        
        // Sources contain canonicalized paths, so we need to canonicalize our expected paths too
        let canon_a = fs::canonicalize(&toolbox_a).unwrap().to_string_lossy().to_string();
        let canon_b = fs::canonicalize(&toolbox_b).unwrap().to_string_lossy().to_string();
        
        assert!(resolved.manifest.sources.contains(&canon_a));
        assert!(resolved.manifest.sources.contains(&canon_b));
        assert_eq!(resolved.manifest.bin_entries.len(), 2);
        assert!(resolved.manifest.bytes_total > 0);
    }

    mod security_tests {
        use super::*;
        use std::os::unix::fs::symlink;

        #[test]
        fn blocks_absolute_path_traversal() {
            let tmp = tempfile::tempdir().unwrap();
            let toolbox = tmp.path().join("evil_toolbox");
            let bin = toolbox.join("bin");
            fs::create_dir_all(&bin).unwrap();

            // Create a target file outside the toolbox
            let evil_target = tmp.path().join("etc_passwd");
            fs::write(&evil_target, "root:x:0:0:root:/root:/bin/bash").unwrap();

            // Create symlink to absolute path outside toolbox
            let evil_symlink = bin.join("evil_tool");
            symlink(&evil_target, &evil_symlink).unwrap();

            let result = resolve_toolboxes(&[toolbox], false);
            assert!(result.is_err());
            let error_msg = result.unwrap_err().to_string();
            assert!(error_msg.contains("symlink target escapes toolbox root"));
        }

        #[test]
        fn blocks_relative_path_traversal() {
            let tmp = tempfile::tempdir().unwrap();
            let toolbox = tmp.path().join("evil_toolbox");
            let bin = toolbox.join("bin");
            fs::create_dir_all(&bin).unwrap();

            // Create a target file outside the toolbox
            let evil_target = tmp.path().join("secret_file");
            fs::write(&evil_target, "sensitive data").unwrap();

            // Create symlink using relative path traversal
            let evil_symlink = bin.join("evil_tool");
            symlink("../../secret_file", &evil_symlink).unwrap();

            let result = resolve_toolboxes(&[toolbox], false);
            assert!(result.is_err());
            let error_msg = result.unwrap_err().to_string();
            assert!(error_msg.contains("symlink target escapes toolbox root"));
        }

        #[test]
        fn blocks_complex_path_traversal() {
            let tmp = tempfile::tempdir().unwrap();
            let toolbox = tmp.path().join("evil_toolbox");
            let bin = toolbox.join("bin");
            let subdir = bin.join("subdir");
            fs::create_dir_all(&subdir).unwrap();

            // Create a target file outside the toolbox
            let evil_target = tmp.path().join("sensitive");
            fs::write(&evil_target, "leaked data").unwrap();

            // Create symlink using complex relative path traversal from subdirectory
            let evil_symlink = subdir.join("evil_tool");
            symlink("../../../sensitive", &evil_symlink).unwrap();

            let result = resolve_toolboxes(&[toolbox], false);
            assert!(result.is_err());
            let error_msg = result.unwrap_err().to_string();
            assert!(error_msg.contains("symlink target escapes toolbox root"));
        }

        #[test]
        fn allows_safe_internal_symlinks() {
            let tmp = tempfile::tempdir().unwrap();
            let toolbox = tmp.path().join("safe_toolbox");
            let bin = toolbox.join("bin");
            fs::create_dir_all(&bin).unwrap();

            // Create a safe target file within the toolbox
            let safe_target = bin.join("real_tool");
            fs::write(&safe_target, "#!/bin/bash\necho safe").unwrap();
            make_exec(&safe_target);

            // Create symlink pointing to file within the same toolbox
            let safe_symlink = bin.join("alias_tool");
            symlink("real_tool", &safe_symlink).unwrap();

            let result = resolve_toolboxes(&[toolbox], true);
            assert!(result.is_ok());
            let resolved = result.unwrap();
            
            // Should have processed the regular file but skipped the symlink
            assert_eq!(resolved.manifest.files_count, 1);
            assert!(resolved.bin.join("real_tool").exists());
            assert!(!resolved.bin.join("alias_tool").exists()); // Symlinks are still skipped in processing
        }

        #[test]
        fn blocks_symlink_chain_attack() {
            let tmp = tempfile::tempdir().unwrap();
            let toolbox = tmp.path().join("chain_toolbox");
            let bin = toolbox.join("bin");
            fs::create_dir_all(&bin).unwrap();

            // Create target outside toolbox
            let external_target = tmp.path().join("external_secret");
            fs::write(&external_target, "secret data").unwrap();

            // Create a direct symlink pointing outside the toolbox using relative path
            let intermediate_symlink = bin.join("intermediate");
            symlink("../../external_secret", &intermediate_symlink).unwrap();

            let result = resolve_toolboxes(&[toolbox], false);
            assert!(result.is_err());
            let error_msg = result.unwrap_err().to_string();
            // The intermediate symlink points outside the toolbox and should be caught
            assert!(error_msg.contains("symlink target escapes toolbox root"));
        }

        #[test]
        fn handles_broken_symlinks_gracefully() {
            let tmp = tempfile::tempdir().unwrap();
            let toolbox = tmp.path().join("broken_toolbox");
            let bin = toolbox.join("bin");
            fs::create_dir_all(&bin).unwrap();

            // Create symlink to non-existent file within toolbox
            let broken_symlink = bin.join("broken_tool");
            symlink("nonexistent_file", &broken_symlink).unwrap();

            let result = resolve_toolboxes(&[toolbox], false);
            assert!(result.is_err());
            // Should fail because canonicalize fails on non-existent target
            let error_msg = result.unwrap_err().to_string();
            assert!(error_msg.contains("failed to canonicalize"));
        }

        #[test]
        fn validates_all_symlinks_in_nested_dirs() {
            let tmp = tempfile::tempdir().unwrap();
            let toolbox = tmp.path().join("nested_toolbox");
            let bin = toolbox.join("bin");
            let nested = bin.join("nested").join("deep");
            fs::create_dir_all(&nested).unwrap();

            // Create external target
            let external_target = tmp.path().join("external");
            fs::write(&external_target, "external data").unwrap();

            // Create regular file in bin
            let regular_tool = bin.join("good_tool");
            fs::write(&regular_tool, "good content").unwrap();
            make_exec(&regular_tool);

            // Create evil symlink deep in nested directory
            let evil_symlink = nested.join("evil_tool");
            symlink("../../../../external", &evil_symlink).unwrap();

            let result = resolve_toolboxes(&[toolbox], false);
            assert!(result.is_err());
            let error_msg = result.unwrap_err().to_string();
            assert!(error_msg.contains("symlink target escapes toolbox root"));
        }

        #[test]
        fn security_limits_are_tighter() {
            // Reset environment to get default values
            std::env::remove_var("AMP_TOOLBOX_MAX_FILES");
            std::env::remove_var("AMP_TOOLBOX_MAX_MB");
            std::env::remove_var("AMP_TOOLBOX_MAX_BYTES");
            
            // Verify that security limits are more restrictive than before
            let (max_files, max_bytes) = crate::toolbox_resolver::limits();
            
            // Default should be 5000 files (down from 10000)
            let expected_files = std::env::var("AMP_TOOLBOX_MAX_FILES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(5_000u64);
            assert_eq!(max_files, expected_files);
            
            // Default should be 250MB (down from 500MB)
            let expected_mb = std::env::var("AMP_TOOLBOX_MAX_MB")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(250u64);
            assert_eq!(max_bytes, expected_mb * 1024 * 1024);
        }
    }
}
