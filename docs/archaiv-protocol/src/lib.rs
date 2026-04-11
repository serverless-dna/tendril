//! `archaiv-protocol` — JSON-RPC 2.0 over NDJSON sidecar protocol.
//!
//! A publishable, reusable crate for event-driven subprocess communication.
//! Zero inference-specific dependencies (no llama_cpp, no deno_core, no Tauri).

pub mod adapter;
pub mod messages;
pub mod ndjson;
pub mod session;
pub mod sink;

// Re-exports for convenience — this is the public API surface.

// Message types
pub use messages::{
    ContentBlock, PromptCompleteData, ProtocolMessage, QueryResultData, StreamEvent, ToolKind,
};

// NDJSON transport
pub use ndjson::{NdjsonError, read_message, write_message};

// Adapter trait (implement this for your inference backend)
pub use adapter::AgentAdapter;

// Session management
pub use session::{PromptMessage, SessionCommand, SessionConfig, SessionState};

// Server-side helpers (for sidecar implementors)
pub use sink::{JsonRpcSink, write_jsonrpc_line};
