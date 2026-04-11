# archaiv-protocol

JSON-RPC 2.0 over NDJSON sidecar protocol for event-driven subprocess communication.

## Overview

`archaiv-protocol` provides a reusable protocol layer for communicating with subprocess (sidecar) processes using JSON-RPC 2.0 messages encoded as newline-delimited JSON (NDJSON) over stdin/stdout.

This crate has **zero inference-specific dependencies** — no llama_cpp, no deno_core, no Tauri. Any project needing to build an event-driven subprocess protocol can depend on it.

## Features

- **JSON-RPC 2.0 message types**: `ProtocolMessage` enum with Request, Response, and Notification variants
- **NDJSON transport**: Async reader/writer for newline-delimited JSON over any `AsyncBufRead`/`AsyncWrite`
- **Stream events**: High-level `StreamEvent` enum for parsed sidecar notifications
- **Agent adapter trait**: `AgentAdapter` for implementing backend-specific protocol translation
- **Session management**: `SessionState` state machine with validated transitions
- **Server-side sink**: `JsonRpcSink` for thread-safe NDJSON writing (sidecar → host)

## Quick Start

```rust
use archaiv_protocol::{ProtocolMessage, StreamEvent, read_message, write_message};
use tokio::io::BufReader;

// Parse a JSON-RPC message from stdin
let mut reader = BufReader::new(tokio::io::stdin());
if let Some(msg) = read_message(&mut reader).await? {
    match msg {
        ProtocolMessage::Request { id, method, params, .. } => {
            // Handle request
            let response = ProtocolMessage::response(id, serde_json::json!({}));
        }
        ProtocolMessage::Notification { method, params, .. } => {
            if method == "session/update" {
                if let Some(update) = params.get("update") {
                    if let Some(event) = StreamEvent::from_update(update) {
                        // Process stream event
                    }
                }
            }
        }
        _ => {}
    }
}
```

## Implementing an Agent Adapter

```rust
use archaiv_protocol::{AgentAdapter, StreamEvent, SessionConfig};
use archaiv_protocol::session::PromptMessage;

struct MyAdapter;

impl AgentAdapter for MyAdapter {
    fn name(&self) -> &str { "my-agent" }
    
    fn initialize_messages(&self, config: &SessionConfig) -> Vec<serde_json::Value> {
        // Return initialization handshake messages
        vec![]
    }
    
    fn translate_prompt(&self, messages: &[PromptMessage], session_id: &str) -> serde_json::Value {
        // Translate prompt to your agent's format
        serde_json::json!({})
    }
    
    fn translate_cancel(&self, request_id: &str) -> serde_json::Value {
        // Translate cancel notification
        serde_json::json!({})
    }
    
    fn parse_stream_message(&self, line: &str) -> Result<StreamEvent, String> {
        // Parse a raw NDJSON line into a StreamEvent
        Err("not implemented".into())
    }
    
    fn extract_session_id(&self, response: &serde_json::Value) -> Option<String> {
        response.get("sessionId")?.as_str().map(String::from)
    }
}
```

## Public API

### Message Types (`messages`)
- `ProtocolMessage` — JSON-RPC 2.0 envelope (Request, Response, Notification)
- `StreamEvent` — High-level parsed stream events
- `ContentBlock`, `ToolKind`, `QueryResultData`, `PromptCompleteData`

### Transport (`ndjson`)
- `read_message()` — Read a single NDJSON line as a `ProtocolMessage`
- `write_message()` — Write a JSON value as an NDJSON line
- `NdjsonError` — Transport error type

### Adapter (`adapter`)
- `AgentAdapter` — Trait for backend-specific protocol translation

### Session (`session`)
- `SessionState` — State machine (Starting → Initializing → Ready → Processing → Error → Stopped)
- `SessionConfig` — Session configuration
- `SessionCommand` — Commands sent to the session engine
- `PromptMessage` — A single message in a prompt request

### Sink (`sink`)
- `JsonRpcSink<W>` — Thread-safe NDJSON writer for sidecar stdout
- `write_jsonrpc_line()` — Write a single JSON-RPC value as NDJSON

## License

MIT
