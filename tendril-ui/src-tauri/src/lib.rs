mod acp;
mod events;

use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;

// Configuration defaults — agent is the single owner of defaults.
// These remain only for init_workspace minimal config until the agent fills in defaults.
const DEFAULT_TIMEOUT_MS: u64 = 45_000;
const DEFAULT_MAX_CAPABILITIES: u32 = 500;
const DEFAULT_MAX_TURNS: u32 = 100;

/// Tauri managed state for the agent process.
pub struct AgentState(pub Arc<Mutex<Option<acp::AgentProcess>>>);

/// App-level config lives at ~/.tendril/config.json
fn app_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".tendril")
        .join("config.json")
}

/// Get the configured workspace path, or None if not set
async fn configured_workspace() -> Option<String> {
    read_app_config_inner().await.ok().and_then(|c| {
        c.get("workspace")
            .and_then(|w| w.as_str())
            .map(|s| s.to_string())
    })
}

/// Validate that a resolved path is within the workspace directory.
/// Prevents path traversal attacks on file read/write commands.
async fn validate_within_workspace(target: &Path) -> Result<(), String> {
    let workspace = configured_workspace()
        .await
        .ok_or("Workspace not configured")?;
    let workspace_canonical = tokio::fs::canonicalize(Path::new(&expand_tilde(&workspace)))
        .await
        .map_err(|e| format!("Failed to resolve workspace path: {e}"))?;
    let target_canonical = tokio::fs::canonicalize(target)
        .await
        .map_err(|e| format!("Failed to resolve target path: {e}"))?;
    if !target_canonical.starts_with(&workspace_canonical) {
        return Err("Access denied: path is outside workspace".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn send_prompt(
    text: String,
    state: tauri::State<'_, AgentState>,
) -> Result<(), String> {
    acp::send_prompt(&text, &state.0).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cancel_prompt(state: tauri::State<'_, AgentState>) -> Result<(), String> {
    acp::send_cancel(&state.0).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn connect_agent_cmd(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentState>,
) -> Result<(), String> {
    acp::connect_agent(&app, &state.0)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn restart_agent(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentState>,
) -> Result<(), String> {
    acp::restart_agent(&app, &state.0)
        .await
        .map_err(|e| e.to_string())
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        if let Some(home) = dirs::home_dir() {
            return path.replacen('~', &home.to_string_lossy(), 1);
        }
    }
    path.to_string()
}

/// Dangerous paths that must never be used as workspace roots.
fn is_dangerous_path(path: &Path) -> bool {
    let s = path.to_string_lossy();
    let dangerous = ["/", "/etc", "/usr", "/var", "/System", "/bin", "/sbin", "/lib", "/tmp"];
    dangerous.iter().any(|d| s == *d)
}

/// Initialize workspace directory structure + save to app config
#[tauri::command]
async fn init_workspace(path: String) -> Result<(), String> {
    let expanded = expand_tilde(&path);
    let workspace = Path::new(&expanded);

    // Reject dangerous paths and path traversal
    if is_dangerous_path(workspace) {
        return Err(format!("Refused to initialize workspace at dangerous path: {expanded}"));
    }
    if expanded.contains("..") {
        return Err("Workspace path must not contain '..' traversal".to_string());
    }

    // Create workspace structure
    tokio::fs::create_dir_all(workspace.join("tools"))
        .await
        .map_err(|e| e.to_string())?;

    // Write empty registry inside tools/
    let tools_index = workspace.join("tools").join("index.json");
    if !tools_index.exists() {
        let index_json = serde_json::to_string_pretty(&serde_json::json!({
            "version": "1.0.0",
            "capabilities": []
        }))
        .map_err(|e| format!("Failed to serialize index: {e}"))?;

        tokio::fs::write(&tools_index, index_json)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Read existing app config or create default, then set workspace path
    let mut config = read_app_config_inner()
        .await
        .unwrap_or_else(|_| default_app_config());
    config["workspace"] = serde_json::json!(expanded);

    write_app_config_inner(&config).await?;

    Ok(())
}

#[tauri::command]
async fn read_capabilities(path: String) -> Result<Vec<Value>, String> {
    let expanded = expand_tilde(&path);
    let base = Path::new(&expanded);

    // Validate workspace boundary
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

/// Read app config from ~/.tendril/config.json
#[tauri::command]
async fn read_config() -> Result<Value, String> {
    read_app_config_inner().await
}

/// Validate known config field types before writing.
fn validate_config_payload(config: &Value) -> Result<(), String> {
    if let Some(workspace) = config.get("workspace").and_then(|w| w.as_str()) {
        if workspace.is_empty() {
            return Err("Config validation: workspace must not be empty".to_string());
        }
        let wp = Path::new(workspace);
        if is_dangerous_path(wp) {
            return Err(format!(
                "Config validation: workspace must not be a system directory: {workspace}"
            ));
        }
    }
    if let Some(sandbox) = config.get("sandbox") {
        if let Some(t) = sandbox.get("timeoutMs") {
            if let Some(n) = t.as_f64() {
                if n <= 0.0 || n != n.floor() {
                    return Err("Config validation: sandbox.timeoutMs must be a positive integer".to_string());
                }
            } else if !t.is_null() {
                return Err("Config validation: sandbox.timeoutMs must be a number".to_string());
            }
        }
    }
    if let Some(registry) = config.get("registry") {
        if let Some(m) = registry.get("maxCapabilities") {
            if let Some(n) = m.as_f64() {
                if n <= 0.0 || n != n.floor() {
                    return Err("Config validation: registry.maxCapabilities must be a positive integer".to_string());
                }
            } else if !m.is_null() {
                return Err("Config validation: registry.maxCapabilities must be a number".to_string());
            }
        }
    }
    if let Some(agent) = config.get("agent") {
        if let Some(m) = agent.get("maxTurns") {
            if let Some(n) = m.as_f64() {
                if n <= 0.0 || n != n.floor() {
                    return Err("Config validation: agent.maxTurns must be a positive integer".to_string());
                }
            } else if !m.is_null() {
                return Err("Config validation: agent.maxTurns must be a number".to_string());
            }
        }
    }
    Ok(())
}

/// Write app config to ~/.tendril/config.json
#[tauri::command]
async fn write_config(config: Value) -> Result<(), String> {
    validate_config_payload(&config)?;
    write_app_config_inner(&config).await
}

#[derive(serde::Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[tauri::command]
async fn list_directory(dir_path: String) -> Result<Vec<FileEntry>, String> {
    let expanded = expand_tilde(&dir_path);
    let dir = Path::new(&expanded);

    // Validate workspace boundary
    validate_within_workspace(dir).await?;

    let mut entries: Vec<FileEntry> = Vec::new();
    let mut read_dir = tokio::fs::read_dir(dir).await.map_err(|e| e.to_string())?;

    while let Some(entry) = read_dir.next_entry().await.map_err(|e| e.to_string())? {
        let metadata = entry.metadata().await.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files starting with .
        if name.starts_with('.') {
            continue;
        }

        entries.push(FileEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }

    // Directories first, then files, alphabetically
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
async fn read_file_content(file_path: String) -> Result<String, String> {
    let expanded = expand_tilde(&file_path);
    let path = Path::new(&expanded);
    validate_within_workspace(path).await?;
    // Limit to 1MB
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err(format!("Not a file: {expanded}"));
    }
    if metadata.len() > 1_048_576 {
        return Err("File too large (>1MB)".to_string());
    }
    tokio::fs::read_to_string(path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn reveal_in_file_explorer(path: String) -> Result<(), String> {
    // Separate URL opening from file revealing
    if path.starts_with("https://") {
        // HTTPS URLs: open in default browser
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    // Reject non-HTTPS URL schemes
    if path.starts_with("http://")
        || path.starts_with("file://")
        || path.starts_with("javascript:")
        || path.starts_with("data:")
    {
        return Err(format!("Unsupported URL scheme: {path}"));
    }

    // File path: validate within workspace, then reveal (don't execute)
    let expanded = expand_tilde(&path);
    let file_path = Path::new(&expanded);
    validate_within_workspace(file_path).await?;

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("--reveal")
            .arg(&expanded)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{expanded}"))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        // xdg-open on the parent directory to reveal the file
        let parent = file_path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| expanded.clone());
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn write_file_content(file_path: String, content: String) -> Result<(), String> {
    let expanded = expand_tilde(&file_path);
    let path = Path::new(&expanded);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err(format!(
                "Parent directory does not exist: {}",
                parent.display()
            ));
        }
    }
    // For new files, validate parent is within workspace
    if path.exists() {
        validate_within_workspace(path).await?;
    } else if let Some(parent) = path.parent() {
        validate_within_workspace(parent).await?;
    }
    tokio::fs::write(path, content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_tool_source(workspace: String, name: String) -> Result<String, String> {
    // Validate tool name is safe (snake_case only)
    // NOTE: This pattern must match VALID_TOOL_NAME in tendril-agent/src/registry.ts
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
    tokio::fs::read_to_string(&tool_path)
        .await
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                format!("Tool source not found: {}", tool_path.display())
            } else {
                e.to_string()
            }
        })
}

#[tauri::command]
async fn get_system_prompt() -> Result<String, String> {
    let workspace = configured_workspace()
        .await
        .unwrap_or_else(|| "~/tendril-workspace".to_string());
    let expanded = expand_tilde(&workspace);
    let prompt_path = Path::new(&expanded).join("system-prompt.txt");

    // Try to read from shared file first (written by agent)
    match tokio::fs::read_to_string(&prompt_path).await {
        Ok(content) => Ok(content),
        Err(_) => {
            // Fallback: return a placeholder until the agent writes the file
            Ok(format!(
                "System prompt not yet available. Start the agent to generate it.\n\
                 Workspace: {workspace}"
            ))
        }
    }
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
            "timeoutMs": DEFAULT_TIMEOUT_MS,
            "allowedDomains": []
        },
        "registry": { "maxCapabilities": DEFAULT_MAX_CAPABILITIES },
        "agent": { "maxTurns": DEFAULT_MAX_TURNS }
    })
}

async fn read_app_config_inner() -> Result<Value, String> {
    let path = app_config_path();
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "Config not found".to_string()
            } else {
                e.to_string()
            }
        })?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

async fn write_app_config_inner(config: &Value) -> Result<(), String> {
    let path = app_config_path();
    let parent = path.parent().ok_or("Config path has no parent directory")?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|e| e.to_string())?;
    let config_str = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    tokio::fs::write(&path, config_str)
        .await
        .map_err(|e| e.to_string())?;
    eprintln!("[config] Saved to {}", path.display());
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AgentState(Arc::new(Mutex::new(None))))
        .invoke_handler(tauri::generate_handler![
            send_prompt,
            cancel_prompt,
            connect_agent_cmd,
            restart_agent,
            init_workspace,
            read_capabilities,
            read_tool_source,
            list_directory,
            read_file_content,
            write_file_content,
            reveal_in_file_explorer,
            read_config,
            write_config,
            get_system_prompt,
        ])
        .setup(|_app| {
            // Agent connection is initiated by the frontend via connect_agent_cmd
            // after event listeners are mounted and workspace is confirmed
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
