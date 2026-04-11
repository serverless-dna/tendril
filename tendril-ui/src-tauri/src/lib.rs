mod acp;
mod events;

use serde_json::Value;
use std::fs;
use std::path::Path;

#[tauri::command]
async fn send_prompt(text: String, app: tauri::AppHandle) -> Result<(), String> {
    let _ = &app; // ensure app handle kept alive
    acp::send_prompt(&text).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cancel_prompt() -> Result<(), String> {
    acp::send_cancel().await.map_err(|e| e.to_string())
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        if let Some(home) = dirs::home_dir() {
            return path.replacen('~', &home.to_string_lossy(), 1);
        }
    }
    path.to_string()
}

#[tauri::command]
async fn init_workspace(path: String) -> Result<(), String> {
    let expanded = expand_tilde(&path);
    let workspace = Path::new(&expanded);

    // Create directory structure
    fs::create_dir_all(workspace.join("tools")).map_err(|e| e.to_string())?;
    fs::create_dir_all(workspace.join(".tendril")).map_err(|e| e.to_string())?;

    // Write empty registry
    fs::write(
        workspace.join("index.json"),
        serde_json::to_string_pretty(&serde_json::json!({
            "version": "1.0.0",
            "capabilities": []
        }))
        .unwrap(),
    )
    .map_err(|e| e.to_string())?;

    // Write default config
    fs::write(
        workspace.join(".tendril").join("config.json"),
        serde_json::to_string_pretty(&serde_json::json!({
            "model": {
                "provider": "bedrock",
                "modelId": "us.anthropic.claude-sonnet-4-5-20250514",
                "region": "us-east-1"
            },
            "sandbox": {
                "denoPath": "deno",
                "timeoutMs": 45000,
                "allowedDomains": ["esm.sh", "deno.land", "cdn.jsdelivr.net"]
            },
            "registry": { "maxCapabilities": 500 },
            "agent": { "maxTurns": 100 }
        }))
        .unwrap(),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn read_capabilities(path: String) -> Result<Vec<Value>, String> {
    let expanded = expand_tilde(&path);
    let index_path = Path::new(&expanded).join("index.json");
    if !index_path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let index: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let caps = index
        .get("capabilities")
        .and_then(|c| c.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(caps)
}

#[tauri::command]
async fn read_config(path: String) -> Result<Value, String> {
    let expanded = expand_tilde(&path);
    let config_path = Path::new(&expanded).join(".tendril").join("config.json");
    if !config_path.exists() {
        return Err("Config not found".to_string());
    }
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_config(path: String, config: Value) -> Result<(), String> {
    let expanded = expand_tilde(&path);
    let config_path = Path::new(&expanded).join(".tendril").join("config.json");
    fs::create_dir_all(Path::new(&expanded).join(".tendril")).map_err(|e| e.to_string())?;
    fs::write(
        &config_path,
        serde_json::to_string_pretty(&config).unwrap(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_system_prompt() -> Result<String, String> {
    Ok("System prompt is assembled by the agent at runtime from the workspace configuration. See tendril-agent/src/prompt.ts for the template.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            send_prompt,
            cancel_prompt,
            init_workspace,
            read_capabilities,
            read_config,
            write_config,
            get_system_prompt,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = acp::connect_agent(&handle).await {
                    eprintln!("Failed to connect agent: {e}");
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
