mod acp;
mod events;

use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

/// App-level config lives at ~/.tendril/config.json
fn app_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".tendril")
        .join("config.json")
}

#[tauri::command]
async fn send_prompt(text: String, app: tauri::AppHandle) -> Result<(), String> {
    let _ = &app;
    acp::send_prompt(&text).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cancel_prompt() -> Result<(), String> {
    acp::send_cancel().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn restart_agent(app: tauri::AppHandle) -> Result<(), String> {
    acp::restart_agent(&app).await.map_err(|e| e.to_string())
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        if let Some(home) = dirs::home_dir() {
            return path.replacen('~', &home.to_string_lossy(), 1);
        }
    }
    path.to_string()
}

/// Initialize workspace directory structure + save to app config
#[tauri::command]
async fn init_workspace(path: String) -> Result<(), String> {
    let expanded = expand_tilde(&path);
    let workspace = Path::new(&expanded);

    // Create workspace structure
    fs::create_dir_all(workspace.join("tools")).map_err(|e| e.to_string())?;

    // Write empty registry
    if !workspace.join("index.json").exists() {
        fs::write(
            workspace.join("index.json"),
            serde_json::to_string_pretty(&serde_json::json!({
                "version": "1.0.0",
                "capabilities": []
            }))
            .unwrap(),
        )
        .map_err(|e| e.to_string())?;
    }

    // Read existing app config or create default, then set workspace path
    let mut config = read_app_config_inner().unwrap_or_else(|_| default_app_config());
    config["workspace"] = serde_json::json!(expanded);

    write_app_config_inner(&config)?;

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

/// Read app config from ~/.tendril/config.json
#[tauri::command]
async fn read_config() -> Result<Value, String> {
    read_app_config_inner()
}

/// Write app config to ~/.tendril/config.json
#[tauri::command]
async fn write_config(config: Value) -> Result<(), String> {
    write_app_config_inner(&config)
}

#[tauri::command]
async fn get_system_prompt() -> Result<String, String> {
    let workspace = read_app_config_inner()
        .ok()
        .and_then(|c| c.get("workspace").and_then(|w| w.as_str()).map(|s| s.to_string()))
        .unwrap_or_else(|| "~/tendril-workspace".to_string());

    Ok(format!(r#"You are Tendril, an agentic assistant with a self-extending toolkit.

Your workspace is at {workspace}.
Your capability registry is at {workspace}/index.json.
Your tool implementations are at {workspace}/tools/*.ts.

BEFORE acting on any request:
1. Call searchCapabilities(query) to check if a relevant tool exists
2. If found: call loadTool(name) then execute(code, args)
3. If NOT found: you MUST build the tool yourself. Write the TypeScript implementation and call registerCapability(definition, code) then execute it. Do NOT ask the user for permission to create tools. Do NOT explain that you need to create a tool. Just create it and use it.

WHEN WRITING A CAPABILITY DEFINITION:
- capability: one sentence, what the tool does, no trigger language
- triggers: 2-5 observable conversational signals that should cause invocation
- suppression: conditions that prevent invocation even when triggers match
- name: snake_case, descriptive, specific

WHEN WRITING TOOL IMPLEMENTATIONS:
- TypeScript, runs in Deno with fetch available
- External packages via: import * as x from "https://esm.sh/{{package}}"
- args object contains parameters passed at execution time
- Output via console.log() — captured as tool result
- Keep implementations focused and single-purpose

SANDBOX:
- Read/write scoped to {workspace}
- fetch() available for any URL — use it to access APIs, web pages, etc.
- No shell access, no process spawning

RULES:
- ACT immediately. Do not narrate. Do not explain what you are about to do.
- NEVER ask "would you like me to create a tool?" — if you need it, build it.
- NEVER say "I don't have a tool for that" — build one and use it.
- Check the registry first. Always. If nothing matches, build and register.
- You are autonomous. The user expects results, not questions about your process."#))
}

fn default_app_config() -> Value {
    serde_json::json!({
        "workspace": null,
        "model": {
            "provider": "bedrock",
            "modelId": "us.anthropic.claude-sonnet-4-5-20250514",
            "region": "us-east-1",
            "profile": null
        },
        "sandbox": {
            "denoPath": "deno",
            "timeoutMs": 45000,
            "allowedDomains": ["esm.sh", "deno.land", "cdn.jsdelivr.net"]
        },
        "registry": { "maxCapabilities": 500 },
        "agent": { "maxTurns": 100 }
    })
}

fn read_app_config_inner() -> Result<Value, String> {
    let path = app_config_path();
    if !path.exists() {
        return Err("Config not found".to_string());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_app_config_inner(config: &Value) -> Result<(), String> {
    let path = app_config_path();
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&path, serde_json::to_string_pretty(config).unwrap())
        .map_err(|e| e.to_string())?;
    eprintln!("[config] Saved to {}", path.display());
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            send_prompt,
            cancel_prompt,
            restart_agent,
            init_workspace,
            read_capabilities,
            read_config,
            write_config,
            get_system_prompt,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Wait for frontend to mount event listeners
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                // Only connect agent if workspace is configured
                match read_app_config_inner() {
                    Ok(config) if config.get("workspace").and_then(|w| w.as_str()).is_some() => {
                        if let Err(e) = acp::connect_agent(&handle).await {
                            eprintln!("Failed to connect agent: {e}");
                        }
                    }
                    _ => {
                        eprintln!("[acp] No workspace configured — skipping agent spawn");
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
