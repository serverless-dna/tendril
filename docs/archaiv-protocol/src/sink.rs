use std::io::Write;
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// Sync NDJSON writer (for sidecar stdout)
// ---------------------------------------------------------------------------

/// Write a single JSON-RPC value as an NDJSON line (JSON + `\n`).
/// Errors are logged to stderr — never panics.
pub fn write_jsonrpc_line(writer: &mut impl Write, value: &serde_json::Value) {
    match serde_json::to_writer(&mut *writer, value) {
        Ok(()) => {
            if let Err(e) = writer.write_all(b"\n") {
                eprintln!("ndjson: failed to write newline: {e}");
            }
        }
        Err(e) => {
            eprintln!("ndjson: failed to serialize JSON-RPC message: {e}");
        }
    }
}

// ---------------------------------------------------------------------------
// JsonRpcSink — thread-safe NDJSON stdout writer
// ---------------------------------------------------------------------------

/// Thread-safe NDJSON writer for stdout (or any `Write` impl).
///
/// Used by the inference sidecar to emit `session/update` notifications.
/// Flushes after every write for low-latency token streaming.
///
/// Generic over `W` so tests can use `Vec<u8>` instead of real stdout.
pub struct JsonRpcSink<W: Write + Send> {
    writer: Arc<Mutex<W>>,
}

impl<W: Write + Send> JsonRpcSink<W> {
    /// Create a new sink wrapping the given writer.
    pub fn new(writer: Arc<Mutex<W>>) -> Self {
        Self { writer }
    }

    /// Write a JSON value as an NDJSON line and flush immediately.
    pub fn emit(&self, value: &serde_json::Value) {
        if let Ok(mut w) = self.writer.lock() {
            write_jsonrpc_line(&mut *w, value);
            let _ = w.flush();
        }
    }

    /// Emit a `session/update` notification with the given update payload.
    pub fn emit_update(&self, update: serde_json::Value) {
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": { "update": update }
        });
        self.emit(&notification);
    }

    /// Flush the underlying writer.
    pub fn flush(&self) {
        if let Ok(mut w) = self.writer.lock() {
            let _ = w.flush();
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
    fn write_jsonrpc_line_produces_valid_ndjson() {
        let mut buf = Vec::new();
        let value = serde_json::json!({"jsonrpc": "2.0", "method": "session/update", "params": {}});
        write_jsonrpc_line(&mut buf, &value);

        let output = String::from_utf8(buf).unwrap();
        assert!(output.ends_with('\n'), "must be newline-terminated");

        let parsed: serde_json::Value = serde_json::from_str(output.trim()).unwrap();
        assert_eq!(parsed["jsonrpc"], "2.0");
    }

    #[test]
    fn write_multiple_lines() {
        let mut buf = Vec::new();
        for i in 0..3 {
            let value = serde_json::json!({"id": i});
            write_jsonrpc_line(&mut buf, &value);
        }

        let output = String::from_utf8(buf).unwrap();
        let lines: Vec<&str> = output.lines().collect();
        assert_eq!(lines.len(), 3);

        for (i, line) in lines.iter().enumerate() {
            let parsed: serde_json::Value = serde_json::from_str(line).unwrap();
            assert_eq!(parsed["id"], i as u64);
        }
    }

    #[test]
    fn sink_emit_update() {
        let buf = Arc::new(Mutex::new(Vec::<u8>::new()));
        let sink = JsonRpcSink::new(buf.clone());

        sink.emit_update(serde_json::json!({
            "sessionUpdate": "agent_message_chunk",
            "text": "hello"
        }));

        let output = String::from_utf8(buf.lock().unwrap().clone()).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(output.trim()).unwrap();
        assert_eq!(parsed["method"], "session/update");
        assert_eq!(parsed["params"]["update"]["text"], "hello");
    }

    #[test]
    fn sink_emit_multiple() {
        let buf = Arc::new(Mutex::new(Vec::<u8>::new()));
        let sink = JsonRpcSink::new(buf.clone());

        sink.emit(&serde_json::json!({"a": 1}));
        sink.emit(&serde_json::json!({"b": 2}));

        let output = String::from_utf8(buf.lock().unwrap().clone()).unwrap();
        let lines: Vec<&str> = output.lines().collect();
        assert_eq!(lines.len(), 2);
    }
}
