use serde_json::Value;
use tauri::{AppHandle, Emitter};

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
            eprintln!("Failed to parse agent output: {e}");
            return;
        }
    };

    // Check if this is a session/update notification
    if msg.get("method").and_then(|m| m.as_str()) == Some("session/update") {
        if let Some(update) = msg.pointer("/params/update") {
            let session_update = update
                .get("sessionUpdate")
                .and_then(|s| s.as_str())
                .unwrap_or("unknown");

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
                    eprintln!("Unknown sessionUpdate type: {other}");
                    return;
                }
            };

            if let Err(e) = app.emit(event_name, update.clone()) {
                eprintln!("Failed to emit event {event_name}: {e}");
            }
        }
    }
    // JSON-RPC responses (id present, no method) are handled by the ACP module
}
