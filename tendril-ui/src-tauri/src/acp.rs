use serde_json::{json, Value};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

use crate::events::{handle_agent_line, log_host_to_agent, chrono_now};

#[derive(thiserror::Error, Debug)]
pub enum AcpError {
    #[error("Failed to spawn agent: {0}")]
    SpawnError(String),
    #[error("Failed to write to agent stdin: {0}")]
    WriteError(String),
    #[error("Agent not connected")]
    NotConnected,
    #[error("Shell error: {0}")]
    ShellError(String),
}

struct AgentProcess {
    child: CommandChild,
    prompt_counter: u32,
    app: AppHandle,
}

static AGENT: OnceLock<Mutex<Option<AgentProcess>>> = OnceLock::new();

fn agent_state() -> &'static Mutex<Option<AgentProcess>> {
    AGENT.get_or_init(|| Mutex::new(None))
}

/// Resolve the deno sidecar path: try resource dir (production), then cwd/binaries (dev), then PATH
fn resolve_deno_path(app: &AppHandle, target_triple: &str) -> String {
    let candidates = [
        app.path().resource_dir()
            .ok()
            .map(|d| d.join("binaries").join(format!("deno-{target_triple}"))),
        std::env::current_dir()
            .ok()
            .map(|d| d.join("binaries").join(format!("deno-{target_triple}"))),
    ];

    for candidate in &candidates {
        if let Some(ref path) = candidate {
            if path.exists() {
                return path.to_string_lossy().to_string();
            }
        }
    }

    "deno".to_string()
}

pub async fn connect_agent(app: &AppHandle) -> Result<(), AcpError> {
    // Hold lock through entire init to prevent race condition
    let mut state = agent_state().lock().await;
    if state.is_some() {
        eprintln!("[acp] Agent already connected — skipping");
        return Ok(());
    }

    eprintln!("[acp] Spawning tendril-agent sidecar...");

    let shell = app.shell();

    // Resolve the deno sidecar path and write to config so the agent reads it
    let target_triple = if cfg!(target_arch = "aarch64") {
        if cfg!(target_os = "macos") { "aarch64-apple-darwin" }
        else { "aarch64-unknown-linux-gnu" }
    } else if cfg!(target_os = "macos") { "x86_64-apple-darwin" }
    else if cfg!(target_os = "windows") { "x86_64-pc-windows-msvc" }
    else { "x86_64-unknown-linux-gnu" };

    let deno_path = resolve_deno_path(app, target_triple);
    eprintln!("[acp] Deno path: {deno_path}");

    // Write deno path into config so the agent can read it
    if let Ok(mut cfg) = crate::read_app_config_inner() {
        if let Some(sandbox) = cfg.get_mut("sandbox").and_then(|s| s.as_object_mut()) {
            sandbox.insert("denoPath".to_string(), serde_json::json!(deno_path));
            let _ = crate::write_app_config_inner(&cfg);
        }
    }

    let cmd = shell
        .sidecar("tendril-agent")
        .map_err(|e| AcpError::ShellError(e.to_string()))?;

    let (mut rx, child) = cmd
        .spawn()
        .map_err(|e| AcpError::SpawnError(e.to_string()))?;

    eprintln!("[acp] Sidecar spawned successfully");

    // Store child process while still holding lock
    *state = Some(AgentProcess {
        child,
        prompt_counter: 0,
        app: app.clone(),
    });

    // Release lock before spawning read task
    drop(state);

    // Spawn task to read agent stdout and forward as Tauri events
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    handle_agent_line(&app_clone, &line);
                }
                CommandEvent::Stderr(line) => {
                    if let Ok(s) = std::str::from_utf8(&line) {
                        let trimmed = s.trim();
                        if !trimmed.is_empty() {
                            eprintln!("[agent] {trimmed}");
                            let _ = app_clone.emit("agent-debug", json!({
                                "direction": "agent-stderr",
                                "message": trimmed,
                                "timestamp": chrono_now(),
                            }));
                        }
                    }
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[acp] Agent terminated: code={:?}", payload.code);
                    let _ = app_clone.emit("agent-debug", json!({
                        "direction": "system",
                        "message": format!("Agent process terminated with code {:?}", payload.code),
                    }));
                    break;
                }
                CommandEvent::Error(msg) => {
                    eprintln!("[acp] Agent IO error: {msg}");
                    break;
                }
                _ => {}
            }
        }
    });

    // Send initialize
    let init_msg = json!({
        "jsonrpc": "2.0",
        "id": "init-1",
        "method": "initialize",
        "params": {
            "protocolVersion": "1.0.0",
            "clientInfo": { "name": "tendril-ui", "version": "0.1.0" },
            "capabilities": {}
        }
    });
    write_to_agent_logged(app, &init_msg).await?;

    // Brief delay to allow initialize response
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Read workspace path from app config
    let workspace = crate::read_app_config_inner()
        .ok()
        .and_then(|c| c.get("workspace").and_then(|w| w.as_str()).map(|s| s.to_string()))
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|h| h.join("tendril-workspace").to_string_lossy().to_string())
                .unwrap_or_else(|| "/tmp/tendril-workspace".to_string())
        });

    eprintln!("[acp] Workspace: {workspace}");

    // Send new_session
    let session_msg = json!({
        "jsonrpc": "2.0",
        "id": "session-1",
        "method": "new_session",
        "params": {
            "workingDirectory": workspace
        }
    });
    write_to_agent_logged(app, &session_msg).await?;

    eprintln!("[acp] Init sequence sent (initialize + new_session)");

    Ok(())
}

async fn write_to_agent_logged(app: &AppHandle, msg: &Value) -> Result<(), AcpError> {
    log_host_to_agent(app, msg);

    let mut state = agent_state().lock().await;
    let agent = state.as_mut().ok_or(AcpError::NotConnected)?;

    let line = format!("{}\n", serde_json::to_string(msg)
        .map_err(|e| AcpError::WriteError(format!("Failed to serialize message: {e}")))?);
    agent
        .child
        .write(line.as_bytes())
        .map_err(|e| AcpError::WriteError(e.to_string()))?;

    Ok(())
}

async fn write_to_agent(msg: &Value) -> Result<(), AcpError> {
    let app = {
        let state = agent_state().lock().await;
        let agent = state.as_ref().ok_or(AcpError::NotConnected)?;
        agent.app.clone()
    };
    write_to_agent_logged(&app, msg).await
}

pub async fn restart_agent(app: &AppHandle) -> Result<(), AcpError> {
    eprintln!("[acp] Restarting agent sidecar...");

    // Kill existing process
    {
        let mut state = agent_state().lock().await;
        if let Some(mut agent) = state.take() {
            let _ = agent.child.kill();
            eprintln!("[acp] Killed previous agent process");
        }
    }

    // Small delay to ensure process is cleaned up
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    // Reconnect
    connect_agent(app).await
}

pub async fn send_prompt(text: &str) -> Result<(), AcpError> {
    let prompt_id = {
        let mut state = agent_state().lock().await;
        let agent = state.as_mut().ok_or(AcpError::NotConnected)?;
        agent.prompt_counter += 1;
        format!("prompt-{}", agent.prompt_counter)
    };

    write_to_agent(&json!({
        "jsonrpc": "2.0",
        "id": prompt_id,
        "method": "prompt",
        "params": {
            "sessionId": "current",
            "messages": [{
                "role": "user",
                "content": [{ "type": "text", "text": text }]
            }]
        }
    }))
    .await
}

pub async fn send_cancel() -> Result<(), AcpError> {
    write_to_agent(&json!({
        "jsonrpc": "2.0",
        "method": "notifications/cancelled",
        "params": { "requestId": "current" }
    }))
    .await
}
