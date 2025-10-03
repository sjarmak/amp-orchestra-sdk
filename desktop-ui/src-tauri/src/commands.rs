use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use tokio::fs;
use std::path::PathBuf;
use std::process::Command;
use serde_json::json;


/// Generate the worktree path for a given session ID
fn path_for(repo_path: &std::path::Path, session_id: &str) -> std::path::PathBuf {
    let short_sid = &session_id[..session_id.len().min(8)];
    repo_path.join(".amp-worktrees").join(short_sid)
}

/// Helper function to get session worktree path
/// Falls back to user-provided cwd if session worktree cannot be determined
async fn get_session_worktree_path(session_id: Option<&str>, fallback_cwd: &str) -> String {
    if let Some(session_id) = session_id {
        // Try to find the repository root from fallback cwd
        let fallback_path = PathBuf::from(fallback_cwd);
        if let Ok(repo_path) = find_repo_root(&fallback_path) {
            let worktree_path = path_for(&repo_path, session_id);
            if worktree_path.exists() {
                return worktree_path.to_string_lossy().to_string();
            }
            // If worktree doesn't exist, return repo root
            return repo_path.to_string_lossy().to_string();
        }
    }
    // Default fallback to provided cwd
    fallback_cwd.to_string()
}

/// Find the Git repository root starting from a given path
fn find_repo_root(start_path: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let mut current_path = start_path;
    
    loop {
        if current_path.join(".git").exists() {
            return Ok(current_path.to_path_buf());
        }
        
        match current_path.parent() {
            Some(parent) => current_path = parent,
            None => return Err("No Git repository found".to_string()),
        }
    }
}

#[tauri::command]
pub async fn get_current_branch(path: String) -> Result<String, String> {
    use std::process::Command;
    
    let output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_string();
        if branch.is_empty() {
            Ok("main".to_string()) // fallback
        } else {
            Ok(branch)
        }
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Git command failed: {}", error))
    }
}

#[tauri::command]
pub async fn get_file_diff(path: String) -> Result<String, String> {
    use std::process::Command;
    
    let output = Command::new("git")
        .args(["diff", "HEAD", &path])
        .current_dir(std::path::Path::new(&path).parent().unwrap_or(std::path::Path::new(".")))
        .output()
        .map_err(|e| format!("Failed to execute git diff: {}", e))?;

    if output.status.success() {
        let diff = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(diff)
    } else {
        let error = String::from_utf8_lossy(&output.stderr);
        Err(format!("Git diff failed: {}", error))
    }
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    use std::path::Path;
    
    // Ensure parent directories exist
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).await
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }
    
    fs::write(&path, content).await
        .map_err(|e| format!("Failed to write file: {}", e))?;
        
    Ok(())
}

#[tauri::command]
pub async fn save_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn spawn_terminal(app: AppHandle, cmd: String, cwd: String, session_id: Option<String>) -> Result<String, String> {
    // Get session worktree path for command execution, fallback to provided cwd
    let working_dir = get_session_worktree_path(session_id.as_deref(), &cwd).await;
    
    // For now, let's just execute a simple command and return a mock PID
    // This will allow the UI to work while we implement proper streaming
    let output = app.shell()
        .command(cmd)
        .current_dir(working_dir)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let pid = "mock-terminal".to_string();
    
    // Emit the output as terminal data
    if !output.stdout.is_empty() {
        if let Ok(stdout) = std::str::from_utf8(&output.stdout) {
            let _ = app.emit("term:data", (&pid, stdout));
        }
    }
    
    if !output.stderr.is_empty() {
        if let Ok(stderr) = std::str::from_utf8(&output.stderr) {
            let _ = app.emit("term:data", (&pid, stderr));
        }
    }
    
    Ok(pid)
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(path);
    let mut entries = fs::read_dir(&path).await.map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        if let Some(name) = entry.file_name().to_str() {
            files.push(name.to_string());
        }
    }
    
    Ok(files)
}

#[tauri::command]
pub async fn open_file_in_vscode(file_path: String, line_number: Option<u32>) -> Result<(), String> {
    println!("Attempting to open file: {} at line: {:?}", file_path, line_number);
    
    // First, try the vscode:// URL scheme approach on macOS
    #[cfg(target_os = "macos")]
    {
        let vscode_url = if let Some(line) = line_number {
            format!("vscode://file{}:{}", file_path, line)
        } else {
            format!("vscode://file{}", file_path)
        };
        
        println!("Trying vscode:// URL: {}", vscode_url);
        
        match Command::new("open").arg(&vscode_url).output() {
            Ok(output) => {
                if output.status.success() {
                    println!("Successfully opened file using vscode:// URL scheme");
                    return Ok(());
                } else {
                    println!("vscode:// URL scheme failed with stderr: {}", String::from_utf8_lossy(&output.stderr));
                }
            },
            Err(e) => {
                println!("Failed to execute vscode:// URL scheme: {}", e);
            }
        }
    }
    
    // Try different VSCode commands with various flags
    let vscode_commands = ["code", "code-insiders", "codium"];
    
    for cmd in &vscode_commands {
        // First try: just the file (let VSCode handle it naturally)
        let mut command = Command::new(cmd);
        if let Some(line) = line_number {
            command.arg("--goto").arg(format!("{}:{}", file_path, line));
        } else {
            command.arg(&file_path);
        }
        
        println!("Trying command: {} with args: {:?}", cmd, command.get_args().collect::<Vec<_>>());
        
        match command.output() {
            Ok(output) => {
                if output.status.success() {
                    println!("Successfully opened file in VSCode using: {}", cmd);
                    return Ok(());
                } else {
                    println!("VSCode command {} failed with stderr: {}", cmd, String::from_utf8_lossy(&output.stderr));
                }
            },
            Err(e) => {
                println!("Failed to execute VSCode command {}: {}", cmd, e);
                continue;
            }
        }
    }
    
    // Last resort: try macOS open command with app name
    #[cfg(target_os = "macos")]
    {
        let mut open_cmd = Command::new("open");
        open_cmd.arg("-a").arg("Visual Studio Code").arg(&file_path);
        
        println!("Trying macOS open command with args: {:?}", open_cmd.get_args().collect::<Vec<_>>());
        
        match open_cmd.output() {
            Ok(output) => {
                if output.status.success() {
                    println!("Successfully opened file using macOS open command");
                    return Ok(());
                } else {
                    println!("macOS open command failed with stderr: {}", String::from_utf8_lossy(&output.stderr));
                }
            },
            Err(e) => {
                println!("Failed to execute macOS open command: {}", e);
            }
        }
    }
    
    Err(format!("Could not open file in VSCode. Tried commands: {:?}", vscode_commands))
}

#[tauri::command] 
pub async fn parse_file_url(url: String) -> Result<serde_json::Value, String> {
    if !url.starts_with("file://") {
        return Err("Not a file URL".to_string());
    }
    
    let path_part = url.strip_prefix("file://").unwrap();
    
    // Parse line numbers from fragment (#L32 or #L32-L42)
    let (file_path, line_info) = if let Some(fragment_idx) = path_part.find('#') {
        let (path, fragment) = path_part.split_at(fragment_idx);
        let fragment = &fragment[1..]; // Remove the #
        
        if fragment.starts_with("L") {
            let line_part = &fragment[1..];
            if let Some(range_idx) = line_part.find('-') {
                // Range like L32-L42, just use the first line
                let start_line = line_part[..range_idx].parse::<u32>().ok();
                (path.to_string(), start_line)
            } else {
                // Single line like L32
                let line = line_part.parse::<u32>().ok();
                (path.to_string(), line)
            }
        } else {
            (path.to_string(), None)
        }
    } else {
        (path_part.to_string(), None)
    };
    
    Ok(json!({
        "file_path": file_path,
        "line_number": line_info
    }))
}
