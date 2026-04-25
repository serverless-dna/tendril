use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

use crate::events::{chrono_now, handle_agent_line, log_host_to_agent};

const MAX_RAPID_CRASHES: usize = 3;
const CRASH_WINDOW_SECS: u64 = 30;

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

pub struct AgentProcess {
    pub child: CommandChild,
    pub prompt_counter: u32,
    pub app: AppHandle,
}

/// Tracks rapid agent crashes to detect doom loops.
pub struct CrashTracker {
    timestamps: Vec<Instant>,
}

impl CrashTracker {
    pub fn new() -> Self {
        CrashTracker {
            timestamps: Vec::new(),
        }
    }

    /// Record a crash and prune entries outside the window.
    pub fn record_crash(&mut self) {
        let now = Instant::now();
        let window = std::time::Duration::from_secs(CRASH_WINDOW_SECS);
        self.timestamps.retain(|t| now.duration_since(*t) < window);
        self.timestamps.push(now);
    }

    /// True if the agent has crashed too many times within the window.
    pub fn is_doom_loop(&self) -> bool {
        self.timestamps.len() >= MAX_RAPID_CRASHES
    }

    /// Reset after a manual restart so the user gets fresh attempts.
    pub fn reset(&mut self) {
        self.timestamps.clear();
    }
}

/// Resolve the deno binary path. Search order:
///   1. Plain "deno" next to the current executable (e.g. Contents/MacOS/ on macOS)
///   2. Triple-suffixed "deno-{triple}" next to the current executable
///   3. resource_dir/binaries/deno-{triple} (Tauri externalBin production path)
///   4. cwd/binaries/deno-{triple} (dev)
///   5. cwd/binaries/deno (dev, plain name)
///   6. Fall back to bare "deno" (relies on PATH)
async fn resolve_deno_path(app: &AppHandle, target_triple: &str) -> String {
    let exe_suffix = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    let triple_filename = format!("deno-{target_triple}{exe_suffix}");
    let plain_filename = format!("deno{exe_suffix}");

    // Directory containing the running executable (Contents/MacOS/ on macOS,
    // the install dir on Windows/Linux).
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let candidates: Vec<Option<std::path::PathBuf>> = vec![
        // 1. Plain "deno" next to the running executable (packaged app)
        exe_dir.as_ref().map(|d| d.join(&plain_filename)),
        // 2. Triple-suffixed next to the running executable
        exe_dir.as_ref().map(|d| d.join(&triple_filename)),
        // 3. resource_dir/binaries with target-triple suffix (Tauri externalBin)
        app.path()
            .resource_dir()
            .ok()
            .map(|d: std::path::PathBuf| d.join("binaries").join(&triple_filename)),
        // 4. cwd/binaries with target-triple suffix (dev)
        std::env::current_dir()
            .ok()
            .map(|d: std::path::PathBuf| d.join("binaries").join(&triple_filename)),
        // 5. cwd/binaries with plain name (dev)
        std::env::current_dir()
            .ok()
            .map(|d: std::path::PathBuf| d.join("binaries").join(&plain_filename)),
    ];

    for path in candidates.iter().flatten() {
        eprintln!("[acp] Checking deno candidate: {}", path.display());
        if tokio::fs::try_exists(path).await.unwrap_or(false) {
            return path.to_string_lossy().to_string();
        }
    }

    eprintln!("[acp] No bundled deno found, falling back to PATH");
    "deno".to_string()
}

pub async fn connect_agent(
    app: &AppHandle,
    agent_mutex: &Arc<Mutex<Option<AgentProcess>>>,
    crash_tracker: &Arc<Mutex<CrashTracker>>,
    env_vars: Option<Vec<(String, String)>>,
) -> Result<(), AcpError> {
    // Hold lock through entire init to prevent race condition
    let mut state = agent_mutex.lock().await;
    if state.is_some() {
        eprintln!("[acp] Agent already connected — skipping");
        return Ok(());
    }

    eprintln!("[acp] Spawning tendril-agent sidecar...");

    let shell = app.shell();

    // Resolve the deno sidecar path and write to config so the agent reads it
    let target_triple = if cfg!(target_arch = "aarch64") {
        if cfg!(target_os = "macos") {
            "aarch64-apple-darwin"
        } else if cfg!(target_os = "windows") {
            "aarch64-pc-windows-msvc"
        } else {
            "aarch64-unknown-linux-gnu"
        }
    } else if cfg!(target_os = "macos") {
        "x86_64-apple-darwin"
    } else if cfg!(target_os = "windows") {
        "x86_64-pc-windows-msvc"
    } else {
        "x86_64-unknown-linux-gnu"
    };

    let deno_path = resolve_deno_path(app, target_triple).await;
    eprintln!("[acp] Deno path: {deno_path}");

    // Write deno path into config so the agent can read it
    if let Ok(mut cfg) = crate::read_app_config_inner().await {
        if let Some(sandbox) = cfg.get_mut("sandbox").and_then(|s| s.as_object_mut()) {
            sandbox.insert("denoPath".to_string(), serde_json::json!(deno_path));
            let _ = crate::write_app_config_inner(&cfg).await;
        }
    }

    let mut cmd = shell
        .sidecar("tendril-agent")
        .map_err(|e| AcpError::ShellError(e.to_string()))?;

    // Inject environment variables passed from the frontend (e.g., API keys from Stronghold)
    if let Some(vars) = &env_vars {
        for (key, value) in vars {
            // FR-018: Env var takes precedence — only inject if not already set in parent process
            if std::env::var(key).is_err() {
                cmd = cmd.env(key, value);
                eprintln!("[acp] Injected env var: {key}");
            } else {
                eprintln!("[acp] {key} already set in environment — skipping injection");
            }
        }
    }

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

    // Create oneshot channel for init-1 response notification
    let (init_tx, init_rx) = tokio::sync::oneshot::channel::<()>();
    let init_tx = std::sync::Mutex::new(Some(init_tx));

    // Spawn task to read agent stdout and forward as Tauri events
    let app_clone = app.clone();
    let reconnect_mutex = Arc::clone(agent_mutex);
    let crash_tracker_clone = Arc::clone(crash_tracker);
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    handle_agent_line(&app_clone, &line, &init_tx);
                }
                CommandEvent::Stderr(line) => {
                    if let Ok(s) = std::str::from_utf8(&line) {
                        let trimmed = s.trim();
                        if !trimmed.is_empty() {
                            eprintln!("[agent] {trimmed}");
                            let _ = app_clone.emit(
                                "agent-debug",
                                json!({
                                    "direction": "agent-stderr",
                                    "message": trimmed,
                                    "timestamp": chrono_now(),
                                }),
                            );
                        }
                    }
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[acp] Agent terminated: code={:?}", payload.code);
                    let _ = app_clone.emit(
                        "agent-debug",
                        json!({
                            "direction": "system",
                            "message": format!("Agent process terminated with code {:?}", payload.code),
                        }),
                    );

                    // Clear agent state
                    {
                        let mut guard = reconnect_mutex.lock().await;
                        *guard = None;
                    }

                    // Check for doom loop before attempting reconnect
                    let is_doom_loop = {
                        let mut tracker = crash_tracker_clone.lock().await;
                        tracker.record_crash();
                        tracker.is_doom_loop()
                    };

                    if is_doom_loop {
                        eprintln!(
                            "[acp] Agent crashed {} times in {}s — not retrying. Check debug log for details.",
                            MAX_RAPID_CRASHES, CRASH_WINDOW_SECS
                        );
                        let _ = app_clone.emit(
                            "connection-status",
                            json!({
                                "status": "error",
                                "message": format!(
                                    "Agent failed to start after {} attempts. Check the debug log for details.",
                                    MAX_RAPID_CRASHES
                                ),
                                "timestamp": chrono_now(),
                            }),
                        );
                    } else {
                        let _ = app_clone.emit(
                            "connection-status",
                            json!({
                                "status": "disconnected",
                                "message": format!("Agent process terminated with code {:?}", payload.code),
                                "timestamp": chrono_now(),
                            }),
                        );
                        // Emit reconnect-needed — the frontend will trigger
                        // connect_agent_cmd after a delay, which avoids Send issues
                        // with nested sidecar spawning in async tasks.
                        let _ = app_clone.emit(
                            "connection-status",
                            json!({
                                "status": "reconnecting",
                                "message": "Agent terminated. Attempting reconnect...",
                                "timestamp": chrono_now(),
                            }),
                        );
                    }

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
    write_to_agent_logged(app, agent_mutex, &init_msg).await?;

    // Wait for the agent to respond to initialize (with timeout)
    match tokio::time::timeout(std::time::Duration::from_secs(10), init_rx).await {
        Ok(Ok(())) => eprintln!("[acp] Received init-1 response"),
        Ok(Err(_)) => eprintln!("[acp] Init channel dropped — agent may have crashed"),
        Err(_) => eprintln!("[acp] Timed out waiting for init-1 response (10s)"),
    }

    // Read workspace path from app config
    let workspace = crate::read_app_config_inner()
        .await
        .ok()
        .and_then(|c| {
            c.get("workspace")
                .and_then(|w| w.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|h| h.join("tendril-workspace").to_string_lossy().to_string())
                .unwrap_or_else(|| {
                    std::env::temp_dir()
                        .join("tendril-workspace")
                        .to_string_lossy()
                        .to_string()
                })
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
    write_to_agent_logged(app, agent_mutex, &session_msg).await?;

    // Emit connected status
    let _ = app.emit(
        "connection-status",
        json!({
            "status": "connected",
            "timestamp": chrono_now(),
        }),
    );

    eprintln!("[acp] Init sequence sent (initialize + new_session)");

    Ok(())
}

pub async fn write_to_agent_logged(
    app: &AppHandle,
    agent_mutex: &Arc<Mutex<Option<AgentProcess>>>,
    msg: &Value,
) -> Result<(), AcpError> {
    log_host_to_agent(app, msg);

    let mut state = agent_mutex.lock().await;
    let agent = state.as_mut().ok_or(AcpError::NotConnected)?;

    let line = format!(
        "{}\n",
        serde_json::to_string(msg)
            .map_err(|e| AcpError::WriteError(format!("Failed to serialize message: {e}")))?
    );
    agent
        .child
        .write(line.as_bytes())
        .map_err(|e| AcpError::WriteError(e.to_string()))?;

    Ok(())
}

pub async fn restart_agent(
    app: &AppHandle,
    agent_mutex: &Arc<Mutex<Option<AgentProcess>>>,
    crash_tracker: &Arc<Mutex<CrashTracker>>,
    env_vars: Option<Vec<(String, String)>>,
) -> Result<(), AcpError> {
    eprintln!("[acp] Restarting agent sidecar...");

    // Kill existing process
    {
        let mut state = agent_mutex.lock().await;
        if let Some(agent) = state.take() {
            let _ = agent.child.kill();
            eprintln!("[acp] Killed previous agent process");
        }
    }

    // Manual restart gets fresh attempts
    {
        let mut tracker = crash_tracker.lock().await;
        tracker.reset();
    }

    // Small delay to ensure process is cleaned up
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    // Reconnect
    connect_agent(app, agent_mutex, crash_tracker, env_vars).await
}

pub async fn send_prompt(
    text: &str,
    agent_mutex: &Arc<Mutex<Option<AgentProcess>>>,
) -> Result<(), AcpError> {
    let (prompt_id, app) = {
        let mut state = agent_mutex.lock().await;
        let agent = state.as_mut().ok_or(AcpError::NotConnected)?;
        agent.prompt_counter += 1;
        (
            format!("prompt-{}", agent.prompt_counter),
            agent.app.clone(),
        )
    };

    write_to_agent_logged(
        &app,
        agent_mutex,
        &json!({
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
        }),
    )
    .await
}

pub async fn send_cancel(agent_mutex: &Arc<Mutex<Option<AgentProcess>>>) -> Result<(), AcpError> {
    let app = {
        let state = agent_mutex.lock().await;
        let agent = state.as_ref().ok_or(AcpError::NotConnected)?;
        agent.app.clone()
    };

    write_to_agent_logged(
        &app,
        agent_mutex,
        &json!({
            "jsonrpc": "2.0",
            "method": "notifications/cancelled",
            "params": { "requestId": "current" }
        }),
    )
    .await
}
