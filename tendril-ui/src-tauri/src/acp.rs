use serde_json::{json, Value};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

use crate::events::{handle_agent_line, log_host_to_agent};

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
    #[allow(dead_code)]
    session_id: Option<String>,
    prompt_counter: u32,
    app: AppHandle,
}

static AGENT: OnceLock<Mutex<Option<AgentProcess>>> = OnceLock::new();

fn agent_state() -> &'static Mutex<Option<AgentProcess>> {
    AGENT.get_or_init(|| Mutex::new(None))
}

pub async fn connect_agent(app: &AppHandle) -> Result<(), AcpError> {
    eprintln!("[acp] Spawning tendril-agent sidecar...");

    let shell = app.shell();

    let cmd = shell
        .sidecar("tendril-agent")
        .map_err(|e| AcpError::ShellError(e.to_string()))?;

    let (mut rx, child) = cmd
        .spawn()
        .map_err(|e| AcpError::SpawnError(e.to_string()))?;

    eprintln!("[acp] Sidecar spawned successfully");

    // Store child process
    {
        let mut state = agent_state().lock().await;
        *state = Some(AgentProcess {
            child,
            session_id: None,
            prompt_counter: 0,
            app: app.clone(),
        });
    }

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
                            // Forward stderr to frontend debug panel too
                            let _ = app_clone.emit("agent-debug", json!({
                                "direction": "agent-stderr",
                                "message": trimmed,
                                "timestamp": format!("{}", std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_secs()),
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

    // Send new_session
    let session_msg = json!({
        "jsonrpc": "2.0",
        "id": "session-1",
        "method": "new_session",
        "params": {
            "workingDirectory": dirs::home_dir()
                .map(|h| h.join("tendril-workspace").to_string_lossy().to_string())
                .unwrap_or_else(|| "/tmp/tendril-workspace".to_string())
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

    let line = format!("{}\n", serde_json::to_string(msg).unwrap());
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
