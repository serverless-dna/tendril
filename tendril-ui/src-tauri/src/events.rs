use serde_json::Value;
use tauri::{AppHandle, Emitter};

/// All protocol messages are forwarded to the frontend as "agent-debug" events
/// for full visibility in the debug panel.
fn emit_debug(app: &AppHandle, direction: &str, msg: &Value) {
    let _ = app.emit("agent-debug", serde_json::json!({
        "direction": direction,
        "message": msg,
        "timestamp": chrono_now(),
    }));
}

fn chrono_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let ms = now.subsec_millis();
    format!("{secs}.{ms:03}")
}

pub fn handle_agent_line(app: &AppHandle, line: &[u8]) {
    let line_str = match std::str::from_utf8(line) {
        Ok(s) => s.trim(),
        Err(_) => return,
    };

    if line_str.is_empty() {
        return;
    }

    let msg: Value = match serde_json::from_str(line_str) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[acp] Failed to parse agent output: {e}");
            eprintln!("[acp] Raw: {line_str}");
            return;
        }
    };

    // Forward everything to debug panel
    emit_debug(app, "agent→host", &msg);

    // JSON-RPC response (has id, no method) — protocol acknowledgement
    if msg.get("id").is_some() && msg.get("method").is_none() {
        eprintln!("[acp] Response: id={}", msg["id"]);
        return;
    }

    // session/update notification
    if msg.get("method").and_then(|m| m.as_str()) == Some("session/update") {
        if let Some(update) = msg.pointer("/params/update") {
            let session_update = update
                .get("sessionUpdate")
                .and_then(|s| s.as_str())
                .unwrap_or("unknown");

            eprintln!("[acp] Event: {session_update}");

            let event_name = match session_update {
                "session_lifecycle" => "session-lifecycle",
                "agent_message_chunk" => "agent-message-chunk",
                "tool_call" => "tool-call",
                "tool_call_update" => "tool-call-update",
                "message_usage" => "message-usage",
                "query_result" => "query-result",
                "prompt_complete" => "prompt-complete",
                "error" => "agent-error",
                other => {
                    eprintln!("[acp] Unknown sessionUpdate type: {other}");
                    return;
                }
            };

            if let Err(e) = app.emit(event_name, update.clone()) {
                eprintln!("[acp] Failed to emit event {event_name}: {e}");
            }
        }
    }
}

/// Call this when sending a message TO the agent, for debug visibility.
pub fn log_host_to_agent(app: &AppHandle, msg: &Value) {
    eprintln!("[acp] host→agent: {}", msg.get("method").or(msg.get("id")).unwrap_or(&Value::Null));
    emit_debug(app, "host→agent", msg);
}
