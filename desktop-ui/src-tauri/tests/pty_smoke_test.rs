use std::io::{Read, Write};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

/// Basic PTY smoke test to verify portable-pty works across platforms
/// This prepares for M1.7 TUI Terminal View implementation
#[test]
fn test_basic_pty_operations() {
    println!("Starting PTY smoke test...");
    
    let pty_system = native_pty_system();
    
    // Test 1: Create a PTY with basic size
    let pty_size = PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    };
    
    let pty_pair = pty_system
        .openpty(pty_size)
        .expect("Failed to create PTY pair");
    
    println!("✓ PTY pair created successfully");
    
    // Test 2: Spawn a simple command
    #[cfg(windows)]
    let mut cmd = CommandBuilder::new("cmd");
    #[cfg(windows)]
    cmd.args(&["/C", "echo Hello from Windows PTY"]);
    
    #[cfg(not(windows))]
    let mut cmd = CommandBuilder::new("sh");
    #[cfg(not(windows))]
    cmd.args(&["-c", "echo 'Hello from Unix PTY'"]);
    
    let child = pty_pair
        .slave
        .spawn_command(cmd)
        .expect("Failed to spawn command in PTY");
    
    println!("✓ Command spawned in PTY");
    
    // Test 3: Read output with timeout
    let mut reader = pty_pair
        .master
        .try_clone_reader()
        .expect("Failed to clone PTY reader");
    
    let (tx, rx) = mpsc::channel();
    let start_time = Instant::now();
    
    // Read output in separate thread with timeout
    thread::spawn(move || {
        let mut buffer = [0u8; 1024];
        match reader.read(&mut buffer) {
            Ok(bytes_read) if bytes_read > 0 => {
                let output = String::from_utf8_lossy(&buffer[..bytes_read]);
                tx.send(Ok(output.to_string())).unwrap_or(());
            }
            Ok(_) => tx.send(Err("No data read".to_string())).unwrap_or(()),
            Err(e) => tx.send(Err(format!("Read error: {}", e))).unwrap_or(()),
        }
    });
    
    // Wait for output or timeout
    let output_result = rx.recv_timeout(Duration::from_secs(10));
    let elapsed = start_time.elapsed();
    
    match output_result {
        Ok(Ok(output)) => {
            println!("✓ Read output from PTY: {}", output.trim());
            assert!(
                output.contains("Hello") || output.contains("PTY"),
                "Expected greeting not found in output: {}",
                output
            );
        }
        Ok(Err(e)) => panic!("PTY read failed: {}", e),
        Err(_) => panic!("PTY read timed out after {:?}", elapsed),
    }
    
    // Test 4: Write to PTY
    let mut writer = pty_pair
        .master
        .take_writer()
        .expect("Failed to get PTY writer");
    
    #[cfg(windows)]
    let test_input = "echo Test write\r\n";
    #[cfg(not(windows))]
    let test_input = "echo Test write\n";
    
    writer
        .write_all(test_input.as_bytes())
        .expect("Failed to write to PTY");
    writer.flush().expect("Failed to flush PTY writer");
    
    println!("✓ Write to PTY successful");
    
    // Test 5: Resize PTY
    let new_size = PtySize {
        rows: 30,
        cols: 100,
        pixel_width: 0,
        pixel_height: 0,
    };
    
    pty_pair
        .master
        .resize(new_size)
        .expect("Failed to resize PTY");
    
    println!("✓ PTY resize successful");
    
    // Test 6: Clean up child process
    drop(child);
    println!("✓ PTY child process cleaned up");
    
    println!("PTY smoke test completed successfully! 🎉");
}

/// Test PTY with different shell commands based on platform
#[test]
fn test_platform_specific_commands() {
    println!("Testing platform-specific PTY commands...");
    
    let pty_system = native_pty_system();
    let pty_size = PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    };
    
    let pty_pair = pty_system
        .openpty(pty_size)
        .expect("Failed to create PTY pair for platform test");
    
    // Test platform-specific commands
    #[cfg(windows)]
    {
        println!("Testing Windows-specific commands...");
        
        // Test Windows dir command
        let mut cmd = CommandBuilder::new("cmd");
        cmd.args(&["/C", "dir /B"]);
        
        let _child = pty_pair
            .slave
            .spawn_command(cmd)
            .expect("Failed to spawn dir command");
        
        println!("✓ Windows 'dir' command spawned");
        
        // Test PowerShell availability (optional - may not be available in all environments)
        let mut ps_cmd = CommandBuilder::new("powershell");
        ps_cmd.args(&["-Command", "Get-Location"]);
        
        match pty_pair.slave.spawn_command(ps_cmd) {
            Ok(_ps_child) => println!("✓ PowerShell command spawned"),
            Err(e) => println!("✓ PowerShell not available or restricted ({})", e),
        }
    }
    
    #[cfg(not(windows))]
    {
        println!("Testing Unix-specific commands...");
        
        // Test Unix ls command
        let mut cmd = CommandBuilder::new("sh");
        cmd.args(&["-c", "ls -la"]);
        
        let _child = pty_pair
            .slave
            .spawn_command(cmd)
            .expect("Failed to spawn ls command");
        
        println!("✓ Unix 'ls' command spawned");
        
        // Test bash availability (optional - may not be available in all environments)
        let mut bash_cmd = CommandBuilder::new("bash");
        bash_cmd.args(&["-c", "pwd"]);
        
        match pty_pair.slave.spawn_command(bash_cmd) {
            Ok(_bash_child) => println!("✓ Bash command spawned"),
            Err(e) => println!("✓ Bash not available or restricted ({})", e),
        }
    }
    
    println!("Platform-specific PTY commands test completed! ✨");
}

/// Test PTY error handling and edge cases
#[test]
fn test_pty_error_handling() {
    println!("Testing PTY error handling...");
    
    let pty_system = native_pty_system();
    let pty_size = PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    };
    
    let pty_pair = pty_system
        .openpty(pty_size)
        .expect("Failed to create PTY pair for error test");
    
    // Test spawning non-existent command
    let bad_cmd = CommandBuilder::new("nonexistent_command_12345");
    
    let spawn_result = pty_pair.slave.spawn_command(bad_cmd);
    assert!(
        spawn_result.is_err(),
        "Expected error when spawning non-existent command"
    );
    
    println!("✓ Non-existent command properly rejected");
    
    // Test invalid PTY size (should still work or give reasonable error)
    let invalid_size = PtySize {
        rows: 0,
        cols: 0,
        pixel_width: 0,
        pixel_height: 0,
    };
    
    let resize_result = pty_pair.master.resize(invalid_size);
    // Note: Some PTY implementations might allow 0x0 size, so we just log the result
    println!("✓ Invalid size resize result: {:?}", resize_result);
    
    println!("PTY error handling test completed! 🛡️");
}
