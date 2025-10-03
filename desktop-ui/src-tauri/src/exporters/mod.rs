use serde::{Deserialize, Serialize};
use std::io::Write;
use std::collections::HashMap;

pub mod export_commands;
#[cfg(test)]
mod test_exporters;

// Session data structure enhanced with M1.4 fields
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionExportData {
    pub id: String,
    pub context: String,
    pub title: Option<String>,
    pub last_snippet: Option<String>,
    pub agent_mode: Option<String>,
    pub toolbox_path: Option<String>,  // M1.4 field
    pub tools_available_count: Option<u32>,  // M1.4 field
    pub tools_used: Option<Vec<String>>,  // M1.4 field (optional)
    pub created_at: String,
    pub updated_at: String,
    // Additional metrics fields
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub inference_duration_ms: Option<u64>,
    pub service_tier: Option<String>,
}

// Export format enum
#[derive(Debug, Clone)]
pub enum ExportFormat {
    Html,
    Csv,
    Jsonl,
}

// Generic exporter trait
pub trait Exporter {
    fn export_sessions(&mut self, sessions: &[SessionExportData], writer: &mut dyn Write) -> Result<(), Box<dyn std::error::Error>>;
}

// HTML Exporter
pub struct HtmlExporter;

impl Exporter for HtmlExporter {
    fn export_sessions(&mut self, sessions: &[SessionExportData], writer: &mut dyn Write) -> Result<(), Box<dyn std::error::Error>> {
        write!(writer, "<!DOCTYPE html>\n<html>\n<head>\n")?;
        write!(writer, "<title>Amp Session Export</title>\n")?;
        write!(writer, "<style>\n")?;
        write!(writer, "table {{ border-collapse: collapse; width: 100%; }}\n")?;
        write!(writer, "th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}\n")?;
        write!(writer, "th {{ background-color: #f2f2f2; }}\n")?;
        write!(writer, ".context-production {{ background-color: #e8f5e8; }}\n")?;
        write!(writer, ".context-development {{ background-color: #fff3cd; }}\n")?;
        write!(writer, "</style>\n")?;
        write!(writer, "</head>\n<body>\n")?;
        write!(writer, "<h1>Amp Session Export</h1>\n")?;
        write!(writer, "<table>\n")?;
        
        // Header
        write!(writer, "<tr>\n")?;
        write!(writer, "<th>ID</th><th>Context</th><th>Title</th><th>Agent Mode</th>\n")?;
        write!(writer, "<th>Toolbox Path</th><th>Tools Available</th><th>Tools Used</th>\n")?;
        write!(writer, "<th>Input Tokens</th><th>Output Tokens</th><th>Duration (ms)</th>\n")?;
        write!(writer, "<th>Created</th><th>Updated</th>\n")?;
        write!(writer, "</tr>\n")?;
        
        // Data rows
        for session in sessions {
            let context_class = match session.context.as_str() {
                "production" => "context-production",
                "development" => "context-development",
                _ => "",
            };
            write!(writer, "<tr class=\"{}\">\n", context_class)?;
            write!(writer, "<td>{}</td>", session.id)?;
            write!(writer, "<td>{}</td>", session.context)?;
            write!(writer, "<td>{}</td>", session.title.as_deref().unwrap_or("N/A"))?;
            write!(writer, "<td>{}</td>", session.agent_mode.as_deref().unwrap_or("N/A"))?;
            write!(writer, "<td>{}</td>", session.toolbox_path.as_deref().unwrap_or("N/A"))?;
            write!(writer, "<td>{}</td>", session.tools_available_count.map(|c| c.to_string()).as_deref().unwrap_or("N/A"))?;
            write!(writer, "<td>{}</td>", session.tools_used.as_ref().map(|tools| tools.join(", ")).as_deref().unwrap_or("N/A"))?;
            write!(writer, "<td>{}</td>", session.input_tokens.map(|t| t.to_string()).as_deref().unwrap_or("N/A"))?;
            write!(writer, "<td>{}</td>", session.output_tokens.map(|t| t.to_string()).as_deref().unwrap_or("N/A"))?;
            write!(writer, "<td>{}</td>", session.inference_duration_ms.map(|d| d.to_string()).as_deref().unwrap_or("N/A"))?;
            write!(writer, "<td>{}</td>", session.created_at)?;
            write!(writer, "<td>{}</td>", session.updated_at)?;
            write!(writer, "</tr>\n")?;
        }
        
        write!(writer, "</table>\n</body>\n</html>\n")?;
        Ok(())
    }
}

// CSV Exporter  
pub struct CsvExporter;

impl Exporter for CsvExporter {
    fn export_sessions(&mut self, sessions: &[SessionExportData], writer: &mut dyn Write) -> Result<(), Box<dyn std::error::Error>> {
        // Header
        writeln!(writer, "id,context,title,agent_mode,toolbox_path,tools_available_count,tools_used,input_tokens,output_tokens,inference_duration_ms,created_at,updated_at")?;
        
        // Data rows
        for session in sessions {
            write!(writer, "{},", session.id)?;
            write!(writer, "{},", session.context)?;
            write!(writer, "\"{}\",", session.title.as_deref().unwrap_or(""))?;
            write!(writer, "{},", session.agent_mode.as_deref().unwrap_or(""))?;
            write!(writer, "\"{}\",", session.toolbox_path.as_deref().unwrap_or(""))?;
            write!(writer, "{},", session.tools_available_count.map(|c| c.to_string()).as_deref().unwrap_or(""))?;
            write!(writer, "\"{}\",", session.tools_used.as_ref().map(|tools| tools.join(";")).as_deref().unwrap_or(""))?;
            write!(writer, "{},", session.input_tokens.map(|t| t.to_string()).as_deref().unwrap_or(""))?;
            write!(writer, "{},", session.output_tokens.map(|t| t.to_string()).as_deref().unwrap_or(""))?;
            write!(writer, "{},", session.inference_duration_ms.map(|d| d.to_string()).as_deref().unwrap_or(""))?;
            write!(writer, "{},", session.created_at)?;
            writeln!(writer, "{}", session.updated_at)?;
        }
        Ok(())
    }
}

// JSONL Exporter
pub struct JsonlExporter;

impl Exporter for JsonlExporter {
    fn export_sessions(&mut self, sessions: &[SessionExportData], writer: &mut dyn Write) -> Result<(), Box<dyn std::error::Error>> {
        for session in sessions {
            let json_line = serde_json::to_string(session)?;
            writeln!(writer, "{}", json_line)?;
        }
        Ok(())
    }
}

// Factory function to create exporter
pub fn create_exporter(format: ExportFormat) -> Box<dyn Exporter> {
    match format {
        ExportFormat::Html => Box::new(HtmlExporter),
        ExportFormat::Csv => Box::new(CsvExporter),
        ExportFormat::Jsonl => Box::new(JsonlExporter),
    }
}

// Helper function to export sessions with a specific format
pub fn export_sessions_to_string(sessions: &[SessionExportData], format: ExportFormat) -> Result<String, Box<dyn std::error::Error>> {
    let mut buffer = Vec::new();
    let mut exporter = create_exporter(format);
    exporter.export_sessions(sessions, &mut buffer)?;
    Ok(String::from_utf8(buffer)?)
}

// Helper to enhance session data with M1.4 fields
pub fn enhance_session_data(base_session: serde_json::Value, toolbox_info: Option<HashMap<String, serde_json::Value>>) -> SessionExportData {
    let toolbox_path = base_session.get("toolbox_path")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    
    // Calculate tools_available_count from toolbox info
    let tools_available_count = toolbox_info.as_ref()
        .and_then(|info| info.get("tool_count"))
        .and_then(|v| v.as_u64())
        .map(|c| c as u32);
    
    // Extract tools_used from toolbox info  
    let tools_used = toolbox_info.as_ref()
        .and_then(|info| info.get("tools_used"))
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter()
            .filter_map(|v| v.as_str())
            .map(|s| s.to_string())
            .collect());
    
    SessionExportData {
        id: base_session.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        context: base_session.get("context").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        title: base_session.get("title").and_then(|v| v.as_str()).map(|s| s.to_string()),
        last_snippet: base_session.get("last_snippet").and_then(|v| v.as_str()).map(|s| s.to_string()),
        agent_mode: base_session.get("agent_mode").and_then(|v| v.as_str()).map(|s| s.to_string()),
        toolbox_path,
        tools_available_count,
        tools_used,
        created_at: base_session.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        updated_at: base_session.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        // Placeholder for future metrics integration
        input_tokens: None,
        output_tokens: None,
        inference_duration_ms: None,
        service_tier: None,
    }
}
