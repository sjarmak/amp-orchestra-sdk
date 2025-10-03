#[cfg(test)]
mod tests {
    use crate::exporters::{SessionExportData, HtmlExporter, CsvExporter, JsonlExporter, ExportFormat, Exporter, export_sessions_to_string, enhance_session_data};

    fn create_test_sessions() -> Vec<SessionExportData> {
        vec![
            SessionExportData {
                id: "session1".to_string(),
                context: "production".to_string(),
                title: Some("Test Session 1".to_string()),
                last_snippet: Some("Hello world".to_string()),
                agent_mode: Some("geppetto:main".to_string()),
                toolbox_path: Some("/usr/local/bin:/home/user/tools".to_string()),
                tools_available_count: Some(15),
                tools_used: Some(vec!["ls".to_string(), "grep".to_string()]),
                created_at: "2024-01-15T10:00:00Z".to_string(),
                updated_at: "2024-01-15T11:30:00Z".to_string(),
                input_tokens: Some(1500),
                output_tokens: Some(2300),
                inference_duration_ms: Some(1200),
                service_tier: Some("premium".to_string()),
            },
            SessionExportData {
                id: "session2".to_string(),
                context: "development".to_string(),
                title: Some("Dev Session".to_string()),
                last_snippet: None,
                agent_mode: Some("claude:3-5-sonnet".to_string()),
                toolbox_path: None,
                tools_available_count: None,
                tools_used: None,
                created_at: "2024-01-15T12:00:00Z".to_string(),
                updated_at: "2024-01-15T12:15:00Z".to_string(),
                input_tokens: Some(800),
                output_tokens: Some(1200),
                inference_duration_ms: Some(950),
                service_tier: None,
            },
        ]
    }

    #[test]
    fn test_html_exporter() {
        let sessions = create_test_sessions();
        let mut buffer = Vec::new();
        let mut exporter = HtmlExporter;
        
        let result = exporter.export_sessions(&sessions, &mut buffer);
        assert!(result.is_ok(), "HTML export should succeed");
        
        let html_output = String::from_utf8(buffer).expect("Should produce valid UTF-8");
        
        // Verify HTML structure
        assert!(html_output.contains("<!DOCTYPE html>"));
        assert!(html_output.contains("<table>"));
        assert!(html_output.contains("session1"));
        assert!(html_output.contains("session2"));
        assert!(html_output.contains("geppetto:main"));
        assert!(html_output.contains("production"));
        assert!(html_output.contains("development"));
        assert!(html_output.contains("context-production"));
        assert!(html_output.contains("context-development"));
        
        println!("HTML Export Preview:\n{}", &html_output[..500.min(html_output.len())]);
    }

    #[test]
    fn test_csv_exporter() {
        let sessions = create_test_sessions();
        let mut buffer = Vec::new();
        let mut exporter = CsvExporter;
        
        let result = exporter.export_sessions(&sessions, &mut buffer);
        assert!(result.is_ok(), "CSV export should succeed");
        
        let csv_output = String::from_utf8(buffer).expect("Should produce valid UTF-8");
        let lines: Vec<&str> = csv_output.lines().collect();
        
        // Verify CSV structure
        assert!(lines.len() >= 3, "Should have header + 2 data rows"); 
        assert!(lines[0].contains("id,context,title"));
        assert!(lines[1].contains("session1"));
        assert!(lines[2].contains("session2"));
        assert!(csv_output.contains("geppetto:main"));
        assert!(csv_output.contains("/usr/local/bin:/home/user/tools"));
        
        println!("CSV Export Preview:\n{}", csv_output);
    }

    #[test]
    fn test_jsonl_exporter() {
        let sessions = create_test_sessions();
        let mut buffer = Vec::new();
        let mut exporter = JsonlExporter;
        
        let result = exporter.export_sessions(&sessions, &mut buffer);
        assert!(result.is_ok(), "JSONL export should succeed");
        
        let jsonl_output = String::from_utf8(buffer).expect("Should produce valid UTF-8");
        let lines: Vec<&str> = jsonl_output.lines().collect();
        
        // Verify JSONL structure
        assert_eq!(lines.len(), 2, "Should have 2 JSON lines");
        
        for line in lines {
            let parsed: serde_json::Value = serde_json::from_str(line).expect("Each line should be valid JSON");
            assert!(parsed.get("id").is_some());
            assert!(parsed.get("context").is_some());
        }
        
        println!("JSONL Export Preview:\n{}", jsonl_output);
    }

    #[test]
    fn test_export_formats() {
        let sessions = create_test_sessions();
        
        // Test all formats through the helper function
        let html_result = export_sessions_to_string(&sessions, ExportFormat::Html);
        assert!(html_result.is_ok());
        
        let csv_result = export_sessions_to_string(&sessions, ExportFormat::Csv);
        assert!(csv_result.is_ok());
        
        let jsonl_result = export_sessions_to_string(&sessions, ExportFormat::Jsonl);
        assert!(jsonl_result.is_ok());
    }

    #[test]
    fn test_enhance_session_data() {
        let base_session = serde_json::json!({
            "id": "test-session",
            "context": "production",
            "title": "Test",
            "toolbox_path": "/usr/local/bin",
            "created_at": "2024-01-15T10:00:00Z",
            "updated_at": "2024-01-15T11:00:00Z"
        });

        let mut toolbox_info = std::collections::HashMap::new();
        toolbox_info.insert("tool_count".to_string(), serde_json::Value::Number(serde_json::Number::from(5)));
        toolbox_info.insert("tools_used".to_string(), serde_json::json!(["grep", "awk"]));

        let enhanced = enhance_session_data(base_session, Some(toolbox_info));

        assert_eq!(enhanced.id, "test-session");
        assert_eq!(enhanced.context, "production");
        assert_eq!(enhanced.toolbox_path, Some("/usr/local/bin".to_string()));
        assert_eq!(enhanced.tools_available_count, Some(5));
        assert_eq!(enhanced.tools_used, Some(vec!["grep".to_string(), "awk".to_string()]));
    }
}
