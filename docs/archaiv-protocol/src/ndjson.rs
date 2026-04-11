use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt};

use crate::messages::ProtocolMessage;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Errors that can occur during NDJSON read/write operations.
#[derive(Debug, thiserror::Error)]
pub enum NdjsonError {
    #[error("NDJSON I/O error: {0}")]
    Io(String),

    #[error("empty NDJSON line")]
    EmptyLine,

    #[error("malformed NDJSON: {error} (line: {raw_line})")]
    MalformedJson { error: String, raw_line: String },

    #[error("NDJSON serialize error: {0}")]
    Serialize(String),
}

// ---------------------------------------------------------------------------
// Async reader — generic over any AsyncBufRead
// ---------------------------------------------------------------------------

/// Reads a single NDJSON line and deserializes it as a [`ProtocolMessage`].
///
/// Returns `Ok(Some(msg))` on success, `Ok(None)` on EOF, or `Err` on parse failure.
pub async fn read_message<R: AsyncBufRead + Unpin>(
    reader: &mut R,
) -> Result<Option<ProtocolMessage>, NdjsonError> {
    let mut line = String::new();
    let n = reader
        .read_line(&mut line)
        .await
        .map_err(|e| NdjsonError::Io(e.to_string()))?;
    if n == 0 {
        return Ok(None); // EOF
    }
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err(NdjsonError::EmptyLine);
    }
    serde_json::from_str::<ProtocolMessage>(trimmed)
        .map(Some)
        .map_err(|e| NdjsonError::MalformedJson {
            error: e.to_string(),
            raw_line: line,
        })
}

// ---------------------------------------------------------------------------
// Async writer — generic over any AsyncWrite
// ---------------------------------------------------------------------------

/// Serializes a JSON value and writes it as a `\n`-terminated NDJSON line.
/// Flushes after each write for low-latency streaming.
pub async fn write_message<W: AsyncWrite + Unpin>(
    writer: &mut W,
    msg: &serde_json::Value,
) -> Result<(), NdjsonError> {
    let mut serialized =
        serde_json::to_string(msg).map_err(|e| NdjsonError::Serialize(e.to_string()))?;
    serialized.push('\n');
    writer
        .write_all(serialized.as_bytes())
        .await
        .map_err(|e| NdjsonError::Io(e.to_string()))?;
    writer
        .flush()
        .await
        .map_err(|e| NdjsonError::Io(e.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use tokio::io::BufReader;

    #[tokio::test]
    async fn read_request() {
        let data =
            r#"{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}"#.to_string() + "\n";
        let mut reader = BufReader::new(Cursor::new(data.into_bytes()));
        let msg = read_message(&mut reader).await.unwrap().unwrap();
        assert_eq!(msg.method(), Some("initialize"));
    }

    #[tokio::test]
    async fn read_eof() {
        let mut reader = BufReader::new(Cursor::new(Vec::new()));
        let result = read_message(&mut reader).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn read_malformed() {
        let data = b"not json\n".to_vec();
        let mut reader = BufReader::new(Cursor::new(data));
        let result = read_message(&mut reader).await;
        assert!(matches!(result, Err(NdjsonError::MalformedJson { .. })));
    }

    #[tokio::test]
    async fn write_message_roundtrip() {
        let value = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {"update": {"sessionUpdate": "agent_message_chunk", "text": "hi"}}
        });
        let mut buf = Vec::new();
        write_message(&mut buf, &value).await.unwrap();
        let written = String::from_utf8(buf).unwrap();
        assert!(written.ends_with('\n'));
        let parsed: serde_json::Value = serde_json::from_str(written.trim()).unwrap();
        assert_eq!(parsed["method"], "session/update");
    }

    #[tokio::test]
    async fn read_multiple_lines() {
        let data = concat!(
            r#"{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}"#,
            "\n",
            r#"{"jsonrpc":"2.0","id":"1","result":{}}"#,
            "\n",
        );
        let mut reader = BufReader::new(Cursor::new(data.as_bytes().to_vec()));
        let msg1 = read_message(&mut reader).await.unwrap().unwrap();
        assert_eq!(msg1.method(), Some("initialize"));
        let msg2 = read_message(&mut reader).await.unwrap().unwrap();
        assert!(msg2.method().is_none()); // Response
        let msg3 = read_message(&mut reader).await.unwrap();
        assert!(msg3.is_none()); // EOF
    }
}
