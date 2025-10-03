use tauri::State;
use crate::exporters::{SessionExportData, ExportFormat, export_sessions_to_string, enhance_session_data};
use std::collections::HashMap;

#[tauri::command]
pub async fn export_sessions(
    format: String,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<String, String> {
    // Parse export format
    let export_format = match format.to_lowercase().as_str() {
        "html" => ExportFormat::Html,
        "csv" => ExportFormat::Csv,
        "jsonl" => ExportFormat::Jsonl,
        _ => return Err("Invalid export format. Supported formats: html, csv, jsonl".to_string()),
    };

    // Get sessions data from database
    if let Some(db) = profile_manager.db_pool.read().await.as_ref() {
        use sqlx::Row;
        let rows = sqlx::query("SELECT id, context, title, last_snippet, agent_mode, toolbox_path, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC")
            .fetch_all(db)
            .await
            .map_err(|e| format!("Database error: {}", e))?;
        
        let sessions: Vec<SessionExportData> = rows.into_iter().map(|r| {
            let base_session = serde_json::json!({
                "id": r.try_get::<String, _>("id").unwrap_or_default(),
                "context": r.try_get::<String, _>("context").unwrap_or_default(),
                "title": r.try_get::<String, _>("title").ok(),
                "last_snippet": r.try_get::<String, _>("last_snippet").ok(),
                "agent_mode": r.try_get::<String, _>("agent_mode").ok(),
                "toolbox_path": r.try_get::<String, _>("toolbox_path").ok(),
                "created_at": r.try_get::<String, _>("created_at").unwrap_or_default(),
                "updated_at": r.try_get::<String, _>("updated_at").unwrap_or_default(),
            });
            
            // Get toolbox info if available (placeholder for future integration)
            let toolbox_info = get_toolbox_info_for_session(&base_session);
            
            enhance_session_data(base_session, toolbox_info)
        }).collect();

        export_sessions_to_string(&sessions, export_format)
            .map_err(|e| format!("Export error: {}", e))
    } else {
        Err("Database not available".to_string())
    }
}

#[tauri::command]
pub async fn export_sessions_to_file(
    format: String,
    file_path: String,
    profile_manager: State<'_, crate::profile_auth::ProfileManager>,
) -> Result<(), String> {
    let export_data = export_sessions(format, profile_manager).await?;
    
    std::fs::write(&file_path, export_data)
        .map_err(|e| format!("Failed to write file {}: {}", file_path, e))?;
    
    Ok(())
}

// Helper function to get toolbox information for a session
// This is a placeholder that should be expanded when toolbox metrics are available
fn get_toolbox_info_for_session(session: &serde_json::Value) -> Option<HashMap<String, serde_json::Value>> {
    let toolbox_path = session.get("toolbox_path")?.as_str()?;
    
    if toolbox_path.is_empty() {
        return None;
    }
    
    // Parse toolbox paths (they might be colon/semicolon separated)
    let paths: Vec<&str> = if cfg!(windows) {
        toolbox_path.split(';').collect()
    } else {
        toolbox_path.split(':').collect()
    };
    
    let mut toolbox_info = HashMap::new();
    
    // Count available tools by scanning toolbox directories
    let mut total_tools = 0u32;
    let mut available_tools = Vec::new();
    
    for path in paths {
        if let Ok(entries) = std::fs::read_dir(path.trim()) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        if let Some(name) = entry.file_name().to_str() {
                            // Count executable files as tools
                            #[cfg(unix)]
                            {
                                use std::os::unix::fs::PermissionsExt;
                                if let Ok(metadata) = entry.metadata() {
                                    if metadata.permissions().mode() & 0o111 != 0 {
                                        total_tools += 1;
                                        available_tools.push(name.to_string());
                                    }
                                }
                            }
                            
                            #[cfg(windows)]
                            {
                                // On Windows, check for common executable extensions
                                if name.ends_with(".exe") || name.ends_with(".bat") || name.ends_with(".cmd") {
                                    total_tools += 1;
                                    available_tools.push(name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    if total_tools > 0 {
        toolbox_info.insert("tool_count".to_string(), serde_json::Value::Number(serde_json::Number::from(total_tools)));
        toolbox_info.insert("available_tools".to_string(), serde_json::json!(available_tools));
        // tools_used would come from session logs/metrics (placeholder for future implementation)
        toolbox_info.insert("tools_used".to_string(), serde_json::json!([]));
        
        Some(toolbox_info)
    } else {
        None
    }
}
