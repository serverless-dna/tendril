//! Tendril UI — Tauri application shell.
//!
//! Module structure:
//!   acp.rs          — Agent process lifecycle (spawn, reconnect, crash detection)
//!   events.rs       — Agent stdout → Tauri event routing
//!   config.rs       — App config CRUD and validation
//!   workspace.rs    — Workspace path security and initialization
//!   files.rs        — File system commands (read, write, list, reveal)
//!   capabilities.rs — Capability registry and tool source reading

mod acp;
pub mod capabilities;
pub mod config;
mod events;
pub mod files;
pub mod workspace;

use std::sync::Arc;
use tokio::sync::Mutex;

/// Tauri managed state for the agent process.
pub struct AgentState(pub Arc<Mutex<Option<acp::AgentProcess>>>);

/// Tauri managed state for crash-loop detection.
pub struct CrashTrackerState(pub Arc<Mutex<acp::CrashTracker>>);

// ── Agent Command Wrappers ──────────────────────────────────────────────────
// These are thin wrappers that delegate to acp.rs.

#[tauri::command]
async fn send_prompt(text: String, state: tauri::State<'_, AgentState>) -> Result<(), String> {
    acp::send_prompt(&text, &state.0)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn cancel_prompt(state: tauri::State<'_, AgentState>) -> Result<(), String> {
    acp::send_cancel(&state.0).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn connect_agent_cmd(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentState>,
    crash_state: tauri::State<'_, CrashTrackerState>,
    env_vars: Option<Vec<(String, String)>>,
) -> Result<(), String> {
    acp::connect_agent(&app, &state.0, &crash_state.0, env_vars)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn restart_agent(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentState>,
    crash_state: tauri::State<'_, CrashTrackerState>,
    env_vars: Option<Vec<(String, String)>>,
) -> Result<(), String> {
    acp::restart_agent(&app, &state.0, &crash_state.0, env_vars)
        .await
        .map_err(|e| e.to_string())
}

// ── Application Bootstrap ───────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            // Stronghold vault for secure API key storage.
            // with_argon2 expects a path to a salt file — it creates one if missing.
            tauri_plugin_stronghold::Builder::with_argon2(
                &dirs::home_dir()
                    .unwrap_or_else(std::env::temp_dir)
                    .join(".tendril")
                    .join("stronghold-salt.txt"),
            )
            .build(),
        )
        .manage(AgentState(Arc::new(Mutex::new(None))))
        .manage(CrashTrackerState(Arc::new(Mutex::new(
            acp::CrashTracker::new(),
        ))))
        .invoke_handler(tauri::generate_handler![
            // Agent lifecycle
            send_prompt,
            cancel_prompt,
            connect_agent_cmd,
            restart_agent,
            // Workspace
            workspace::init_workspace,
            // Config
            config::read_config,
            config::write_config,
            // Files
            files::list_directory,
            files::read_file_content,
            files::write_file_content,
            files::reveal_in_file_explorer,
            // Capabilities
            capabilities::read_capabilities,
            capabilities::read_tool_source,
            capabilities::get_system_prompt,
        ])
        .setup(|_app| {
            // Agent connection is initiated by the frontend via connect_agent_cmd
            // after event listeners are mounted and workspace is confirmed.
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
