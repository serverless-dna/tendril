//! Capability registry and system prompt reading.
//!
//! These commands let the frontend browse registered capabilities and
//! view tool source code without going through the agent.

use serde_json::Value;
use std::path::Path;

use crate::config;
use crate::workspace::{expand_tilde, validate_within_workspace};

#[tauri::command]
pub async fn read_capabilities(path: String) -> Result<Vec<Value>, String> {
    let expanded = expand_tilde(&path);
    let base = Path::new(&expanded);

    validate_within_workspace(base).await?;

    let index_path = base.join("tools").join("index.json");
    match tokio::fs::read_to_string(&index_path).await {
        Ok(content) => {
            let index: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            let caps = index
                .get("capabilities")
                .and_then(|c| c.as_array())
                .cloned()
                .unwrap_or_default();
            Ok(caps)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn read_tool_source(workspace: String, name: String) -> Result<String, String> {
    // Validate tool name is safe (snake_case only).
    // This pattern must match VALID_TOOL_NAME in tendril-agent/src/loop/registry.ts
    if !name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err(format!(
            "Invalid tool name: {name}. Only lowercase letters, digits, and underscores allowed."
        ));
    }

    let expanded = expand_tilde(&workspace);
    let tool_path = Path::new(&expanded)
        .join("tools")
        .join(format!("{name}.ts"));

    tokio::fs::read_to_string(&tool_path).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("Tool source not found: {}", tool_path.display())
        } else {
            e.to_string()
        }
    })
}

#[tauri::command]
pub async fn get_system_prompt() -> Result<String, String> {
    let workspace = config::configured_workspace()
        .await
        .unwrap_or_else(|| "~/tendril-workspace".to_string());
    let expanded = expand_tilde(&workspace);
    let prompt_path = Path::new(&expanded).join("system-prompt.txt");

    // Try to read from shared file first (written by agent on startup)
    match tokio::fs::read_to_string(&prompt_path).await {
        Ok(content) => Ok(content),
        Err(_) => Ok(format!(
            "System prompt not yet available. Start the agent to generate it.\n\
             Workspace: {workspace}"
        )),
    }
}
