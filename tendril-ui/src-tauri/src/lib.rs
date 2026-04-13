mod acp;
mod events;

use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

// Configuration defaults
const DEFAULT_TIMEOUT_MS: u64 = 45_000;
const DEFAULT_MAX_CAPABILITIES: u32 = 500;
const DEFAULT_MAX_TURNS: u32 = 100;

/// App-level config lives at ~/.tendril/config.json
fn app_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".tendril")
        .join("config.json")
}

/// Get the configured workspace path, or None if not set
fn configured_workspace() -> Option<String> {
    read_app_config_inner()
        .ok()
        .and_then(|c| c.get("workspace").and_then(|w| w.as_str()).map(|s| s.to_string()))
}

/// Validate that a resolved path is within the workspace directory.
/// Prevents path traversal attacks on file read/write commands.
fn validate_within_workspace(target: &Path) -> Result<(), String> {
    let workspace = configured_workspace()
        .ok_or("Workspace not configured")?;
    let workspace_canonical = fs::canonicalize(Path::new(&expand_tilde(&workspace)))
        .map_err(|e| format!("Failed to resolve workspace path: {e}"))?;
    let target_canonical = fs::canonicalize(target)
        .map_err(|e| format!("Failed to resolve target path: {e}"))?;
    if !target_canonical.starts_with(&workspace_canonical) {
        return Err("Access denied: path is outside workspace".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn send_prompt(text: String, _app: tauri::AppHandle) -> Result<(), String> {
    acp::send_prompt(&text).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cancel_prompt() -> Result<(), String> {
    acp::send_cancel().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn connect_agent_cmd(app: tauri::AppHandle) -> Result<(), String> {
    acp::connect_agent(&app).await.map_err(|e| e.to_string())
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

    // Write empty registry inside tools/
    let tools_index = workspace.join("tools").join("index.json");
    if !tools_index.exists() {
        let index_json = serde_json::to_string_pretty(&serde_json::json!({
            "version": "1.0.0",
            "capabilities": []
        }))
        .map_err(|e| format!("Failed to serialize index: {e}"))?;

        fs::write(&tools_index, index_json)
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
    let index_path = Path::new(&expanded).join("tools").join("index.json");
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
    if !dir.is_dir() {
        return Err(format!("Not a directory: {expanded}"));
    }

    let mut entries: Vec<FileEntry> = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
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
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
async fn read_file_content(file_path: String) -> Result<String, String> {
    let expanded = expand_tilde(&file_path);
    let path = Path::new(&expanded);
    if !path.is_file() {
        return Err(format!("Not a file: {expanded}"));
    }
    validate_within_workspace(path)?;
    // Limit to 1MB
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() > 1_048_576 {
        return Err("File too large (>1MB)".to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn reveal_in_file_explorer(path: String) -> Result<(), String> {
    let expanded = expand_tilde(&path);
    if !Path::new(&expanded).exists() {
        return Err(format!("Path does not exist: {expanded}"));
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&expanded)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&expanded)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&expanded)
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
            return Err(format!("Parent directory does not exist: {}", parent.display()));
        }
    }
    // For new files, validate parent is within workspace
    if path.exists() {
        validate_within_workspace(path)?;
    } else if let Some(parent) = path.parent() {
        validate_within_workspace(parent)?;
    }
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_tool_source(workspace: String, name: String) -> Result<String, String> {
    // Validate tool name is safe (snake_case only)
    if !name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err(format!("Invalid tool name: {name}. Only lowercase letters, digits, and underscores allowed."));
    }
    let expanded = expand_tilde(&workspace);
    let tool_path = Path::new(&expanded).join("tools").join(format!("{name}.ts"));
    if !tool_path.exists() {
        return Err(format!("Tool source not found: {}", tool_path.display()));
    }
    fs::read_to_string(&tool_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_system_prompt() -> Result<String, String> {
    let workspace = configured_workspace()
        .unwrap_or_else(|| "~/tendril-workspace".to_string());

    Ok(format!(r#"You are Tendril, an agentic assistant with a self-extending toolkit.

Your workspace is at {workspace}.
Your tool implementations and registry are at {workspace}/tools/ (index.json + *.ts files).

BEFORE acting on any request:
1. Call searchCapabilities(query) to check if a relevant tool exists
2. If found: call loadTool(name) then execute(code, args)
3. If NOT found: decide — is this a one-off or something the user might ask again?
   - ONE-OFF (e.g. "read me that file", "what's in this directory"): use execute() with Deno built-ins directly
   - REUSABLE (e.g. "fetch this API", "parse this format", "search these logs"): build a tool, register it, then execute it

REUSE OVER DUPLICATION:
- searchCapabilities() is not optional. It is step 1 of every task.
- If a tool exists, use it. Do not rewrite it. Do not "improve" it.
- If you find yourself writing the same kind of execute() code a second time, that's a signal to register it as a tool.
- The registry is your memory. Tools you build today save time tomorrow.

WHEN TO USE execute() DIRECTLY (no tool needed):
These Deno built-ins are available inside execute() for simple one-off operations:
- Deno.readTextFile(path) — read a file
- Deno.readDir(path) — list directory contents
- Deno.stat(path) — file metadata
- Deno.writeTextFile(path, content) — write a file
- fetch(url) — a single HTTP request with no parsing
- console.log() — output results
Use these for trivial, non-repeatable tasks. If the operation involves parsing, filtering, transforming, or any logic beyond a single API call, build a tool.

WHEN TO BUILD AND REGISTER A TOOL:
Build a tool when the task involves:
- Calling an API and extracting specific data from the response
- Parsing or transforming a data format (CSV, XML, logs, etc.)
- Multi-step operations (fetch + parse + filter)
- Anything the user is likely to ask for again, even with different inputs
- Domain-specific logic (e.g. "check the status of X", "summarise Y")

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

OUTPUT DISCIPLINE:
Tools must return ONLY the data needed to answer the user's question — nothing else.
- Filter, extract, and reshape data inside the tool before outputting.
- Never dump raw API responses, full file contents, or entire data structures when only a subset is needed.
- If the user asks "what version?" the tool returns the version string, not the entire package.json.
- If the user asks about errors in a log, the tool returns matching lines, not the full log.
- Smaller outputs mean faster responses and less wasted context. Design every console.log() as if tokens cost money — because they do.

SANDBOX:
- Read/write scoped to {workspace}
- fetch() available for any URL — use it to access APIs, web pages, etc.
- No shell access, no process spawning

RULES:
- ACT immediately. Do not narrate. Do not explain what you are about to do.
- NEVER ask "would you like me to create a tool?" — if you need it, build it.
- NEVER say "I don't have a tool for that" — use a built-in or build one.
- NEVER answer from training data when a tool could get live information. Always try the tool first.
- If a tool execution fails, read the error, fix the code, and retry. Do NOT fall back to answering from memory.
- If the sandbox or Deno is unavailable, say so explicitly — do NOT pretend you have the answer.
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
            "timeoutMs": DEFAULT_TIMEOUT_MS,
            "allowedDomains": []
        },
        "registry": { "maxCapabilities": DEFAULT_MAX_CAPABILITIES },
        "agent": { "maxTurns": DEFAULT_MAX_TURNS }
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
    let parent = path.parent()
        .ok_or("Config path has no parent directory")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let config_str = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(&path, config_str).map_err(|e| e.to_string())?;
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
