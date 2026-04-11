use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 envelope
// ---------------------------------------------------------------------------

/// Low-level JSON-RPC 2.0 envelope parsed from an NDJSON line.
///
/// Three-variant enum using `serde(untagged)` — order matters for
/// deserialization: Request has both `id` and `method`, Response has `id`
/// but no `method`, Notification has `method` but no `id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ProtocolMessage {
    Request {
        jsonrpc: String,
        id: serde_json::Value,
        method: String,
        #[serde(default)]
        params: serde_json::Value,
    },
    Response {
        jsonrpc: String,
        id: serde_json::Value,
        #[serde(default)]
        result: serde_json::Value,
    },
    Notification {
        jsonrpc: String,
        method: String,
        #[serde(default)]
        params: serde_json::Value,
    },
}

impl ProtocolMessage {
    /// Returns the `id` field if this is a Request or Response.
    pub fn id(&self) -> Option<&serde_json::Value> {
        match self {
            Self::Request { id, .. } | Self::Response { id, .. } => Some(id),
            Self::Notification { .. } => None,
        }
    }

    /// Returns the `method` field if this is a Request or Notification.
    pub fn method(&self) -> Option<&str> {
        match self {
            Self::Request { method, .. } | Self::Notification { method, .. } => Some(method),
            Self::Response { .. } => None,
        }
    }

    /// Returns the `params` field if this is a Request or Notification.
    pub fn params(&self) -> Option<&serde_json::Value> {
        match self {
            Self::Request { params, .. } | Self::Notification { params, .. } => Some(params),
            Self::Response { .. } => None,
        }
    }

    /// Construct a JSON-RPC 2.0 response for a given request id.
    pub fn response(id: serde_json::Value, result: serde_json::Value) -> Self {
        Self::Response {
            jsonrpc: "2.0".into(),
            id,
            result,
        }
    }

    /// Construct a JSON-RPC 2.0 notification (no id, no response expected).
    pub fn notification(method: impl Into<String>, params: serde_json::Value) -> Self {
        Self::Notification {
            jsonrpc: "2.0".into(),
            method: method.into(),
            params,
        }
    }

    /// Construct a JSON-RPC 2.0 request.
    pub fn request(
        id: serde_json::Value,
        method: impl Into<String>,
        params: serde_json::Value,
    ) -> Self {
        Self::Request {
            jsonrpc: "2.0".into(),
            id,
            method: method.into(),
            params,
        }
    }
}

// ---------------------------------------------------------------------------
// High-level stream events (adapter-parsed)
// ---------------------------------------------------------------------------

/// High-level event produced by parsing `session/update` notifications.
/// Simplified from the Kovar protocol — no permissions, no config, no cost.
#[derive(Debug, Clone)]
pub enum StreamEvent {
    /// Session lifecycle event (connected, model_loaded, model_load_error, error).
    SessionLifecycle {
        stage: String,
        agent_info: Option<String>,
        error: Option<String>,
    },
    /// Streamed token(s) from the model.
    AgentMessageChunk { text: String },
    /// Model requests tool execution.
    ToolCall {
        tool_call_id: String,
        title: String,
        kind: ToolKind,
        input: serde_json::Value,
    },
    /// Tool execution result (after sandbox execution by the app).
    ToolCallUpdate {
        tool_call_id: String,
        status: String,
        raw_output: Option<String>,
    },
    /// Turn-end token accounting. No cost field (local inference).
    QueryResult(QueryResultData),
    /// Turn boundary with stop reason.
    PromptComplete(PromptCompleteData),
    /// Non-fatal error during streaming.
    Error { message: String },
    /// Pass-through for unrecognised notification methods.
    Raw {
        method: String,
        params: serde_json::Value,
    },
}

// ---------------------------------------------------------------------------
// Helper structs
// ---------------------------------------------------------------------------

/// Content block within a streamed response.
#[derive(Debug, Clone)]
pub enum ContentBlock {
    Text { text: String },
}

/// Tool kind classification.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolKind {
    Read,
    Write,
    Execute,
    Other,
}

impl ToolKind {
    /// Map a protocol kind string to our enum.
    pub fn from_str_loose(kind: &str) -> Self {
        match kind {
            "read" => Self::Read,
            "write" | "edit" => Self::Write,
            "execute" | "bash" => Self::Execute,
            _ => Self::Other,
        }
    }
}

/// Token accounting at end of turn.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResultData {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub total_tokens: u32,
    pub duration_ms: u32,
    pub context_tokens: u32,
    pub context_limit: u32,
}

/// Turn completion signal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptCompleteData {
    pub stop_reason: String,
}

// ---------------------------------------------------------------------------
// Parsing session/update notifications into StreamEvent
// ---------------------------------------------------------------------------

impl StreamEvent {
    /// Parse a `session/update` notification's `params.update` object into a
    /// `StreamEvent`. Returns `None` if the update type is unrecognised.
    pub fn from_update(update: &serde_json::Value) -> Option<Self> {
        let update_type = update.get("sessionUpdate")?.as_str()?;
        match update_type {
            "session_lifecycle" => Some(Self::SessionLifecycle {
                stage: update
                    .get("stage")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                agent_info: update
                    .get("agent_info")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                error: update
                    .get("error")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            }),
            "agent_message_chunk" => Some(Self::AgentMessageChunk {
                text: update
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            }),
            "tool_call" => Some(Self::ToolCall {
                tool_call_id: update
                    .get("toolCallId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                title: update
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                kind: update
                    .get("kind")
                    .and_then(|v| v.as_str())
                    .map(ToolKind::from_str_loose)
                    .unwrap_or(ToolKind::Other),
                input: update.get("input").cloned().unwrap_or_default(),
            }),
            "tool_call_update" => Some(Self::ToolCallUpdate {
                tool_call_id: update
                    .get("toolCallId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                status: update
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                raw_output: update
                    .get("rawOutput")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            }),
            "query_result" => {
                let data: QueryResultData = serde_json::from_value(update.clone()).ok()?;
                Some(Self::QueryResult(data))
            }
            "prompt_complete" => Some(Self::PromptComplete(PromptCompleteData {
                stop_reason: update
                    .get("stop_reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
            })),
            "error" => Some(Self::Error {
                message: update
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown error")
                    .to_string(),
            }),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_request() {
        let json = r#"{"jsonrpc":"2.0","id":"init-1","method":"initialize","params":{"protocolVersion":"1.0.0"}}"#;
        let msg: ProtocolMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.method(), Some("initialize"));
        assert!(msg.id().is_some());
    }

    #[test]
    fn parse_response() {
        let json = r#"{"jsonrpc":"2.0","id":"init-1","result":{"agentInfo":{"name":"test"}}}"#;
        let msg: ProtocolMessage = serde_json::from_str(json).unwrap();
        assert!(msg.id().is_some());
        assert!(msg.method().is_none());
    }

    #[test]
    fn parse_notification() {
        let json = r#"{"jsonrpc":"2.0","method":"session/update","params":{"update":{"sessionUpdate":"agent_message_chunk","text":"hello"}}}"#;
        let msg: ProtocolMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.method(), Some("session/update"));
        assert!(msg.id().is_none());
    }

    #[test]
    fn parse_stream_event_chunk() {
        let update = serde_json::json!({"sessionUpdate": "agent_message_chunk", "text": "hello"});
        let event = StreamEvent::from_update(&update).unwrap();
        match event {
            StreamEvent::AgentMessageChunk { text } => assert_eq!(text, "hello"),
            _ => panic!("expected AgentMessageChunk"),
        }
    }

    #[test]
    fn parse_stream_event_lifecycle() {
        let update = serde_json::json!({"sessionUpdate": "session_lifecycle", "stage": "connected", "agent_info": "test"});
        let event = StreamEvent::from_update(&update).unwrap();
        match event {
            StreamEvent::SessionLifecycle {
                stage, agent_info, ..
            } => {
                assert_eq!(stage, "connected");
                assert_eq!(agent_info.as_deref(), Some("test"));
            }
            _ => panic!("expected SessionLifecycle"),
        }
    }

    #[test]
    fn parse_stream_event_prompt_complete() {
        let update =
            serde_json::json!({"sessionUpdate": "prompt_complete", "stop_reason": "end_turn"});
        let event = StreamEvent::from_update(&update).unwrap();
        match event {
            StreamEvent::PromptComplete(data) => assert_eq!(data.stop_reason, "end_turn"),
            _ => panic!("expected PromptComplete"),
        }
    }

    #[test]
    fn construct_request() {
        let msg = ProtocolMessage::request(
            serde_json::json!("r-1"),
            "initialize",
            serde_json::json!({}),
        );
        let serialized = serde_json::to_string(&msg).unwrap();
        assert!(serialized.contains("\"method\":\"initialize\""));
        assert!(serialized.contains("\"id\":\"r-1\""));
    }

    #[test]
    fn construct_notification() {
        let msg = ProtocolMessage::notification(
            "session/update",
            serde_json::json!({"update": {"sessionUpdate": "agent_message_chunk", "text": "hi"}}),
        );
        let serialized = serde_json::to_string(&msg).unwrap();
        assert!(serialized.contains("\"method\":\"session/update\""));
        assert!(!serialized.contains("\"id\""));
    }

    #[test]
    fn tool_kind_from_str() {
        assert_eq!(ToolKind::from_str_loose("read"), ToolKind::Read);
        assert_eq!(ToolKind::from_str_loose("write"), ToolKind::Write);
        assert_eq!(ToolKind::from_str_loose("edit"), ToolKind::Write);
        assert_eq!(ToolKind::from_str_loose("execute"), ToolKind::Execute);
        assert_eq!(ToolKind::from_str_loose("unknown"), ToolKind::Other);
    }
}
