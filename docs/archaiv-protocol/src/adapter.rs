use crate::messages::StreamEvent;
use crate::session::SessionConfig;

/// Abstracts agent-specific protocol translation from the core protocol engine.
///
/// Implement this trait for each inference backend (e.g., local llama_cpp,
/// remote API, etc.). The protocol crate itself has no inference dependencies.
pub trait AgentAdapter: Send + 'static {
    /// Human-readable adapter name (e.g., "archaiv-inference").
    fn name(&self) -> &str;

    /// Ordered NDJSON messages for the connection startup handshake.
    /// Typically: initialize request, then load_model request.
    fn initialize_messages(&self, config: &SessionConfig) -> Vec<serde_json::Value>;

    /// Translate a user prompt into the agent's prompt request format.
    fn translate_prompt(
        &self,
        messages: &[crate::session::PromptMessage],
        session_id: &str,
    ) -> serde_json::Value;

    /// Translate a cancel command into the agent's cancellation notification.
    fn translate_cancel(&self, request_id: &str) -> serde_json::Value;

    /// Parse a raw NDJSON line from the agent into a high-level [`StreamEvent`].
    fn parse_stream_message(&self, line: &str) -> Result<StreamEvent, String>;

    /// Extract the session ID from a `new_session` response.
    fn extract_session_id(&self, response: &serde_json::Value) -> Option<String>;
}
