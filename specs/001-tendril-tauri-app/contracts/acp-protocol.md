# ACP Protocol Contract: Tendril Agent (Minimum Viable)

**Branch**: `001-tendril-tauri-app` | **Date**: 2026-04-11
**Scope**: Minimum viable subset for initial implementation.

## Transport

- NDJSON over stdin/stdout
- JSON-RPC 2.0 message format
- UTF-8 encoding
- One JSON object per `\n`-terminated line

## Host → Agent (stdin)

### initialize

```json
{
  "jsonrpc": "2.0",
  "id": "init-1",
  "method": "initialize",
  "params": {
    "protocolVersion": "1.0.0",
    "clientInfo": { "name": "tendril-ui", "version": "0.1.0" },
    "capabilities": {}
  }
}
```

**Response** (within 30 seconds):
```json
{
  "jsonrpc": "2.0",
  "id": "init-1",
  "result": {
    "agentInfo": { "name": "tendril-agent", "version": "0.1.0" },
    "authMethods": []
  }
}
```

### new_session

```json
{
  "jsonrpc": "2.0",
  "id": "session-1",
  "method": "new_session",
  "params": {
    "workingDirectory": "/path/to/workspace"
  }
}
```

**Response**:
```json
{"jsonrpc": "2.0", "id": "session-1", "result": {"sessionId": "uuid"}}
```

**Then agent MUST emit**:
```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "update": {
      "sessionUpdate": "session_lifecycle",
      "stage": "connected",
      "agent_info": "tendril-agent",
      "acp_session_id": "uuid",
      "is_restored": false
    }
  }
}
```

### prompt

```json
{
  "jsonrpc": "2.0",
  "id": "prompt-1",
  "method": "prompt",
  "params": {
    "sessionId": "uuid",
    "messages": [
      { "role": "user", "content": [{"type": "text", "text": "..."}] }
    ]
  }
}
```

**Response** (immediate, empty):
```json
{"jsonrpc": "2.0", "id": "prompt-1", "result": {}}
```

Then stream events follow asynchronously.

### notifications/cancelled

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/cancelled",
  "params": { "requestId": "prompt-1" }
}
```

No response. Agent stops processing and emits `prompt_complete` with `stop_reason: "interrupted"`.

### Shutdown

Host closes stdin. Agent cleans up and exits with code 0.

## Agent → Host (stdout) Stream Events

### agent_message_chunk

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "update": {
      "sessionUpdate": "agent_message_chunk",
      "text": "token text",
      "content": {"type": "text", "text": "token text"}
    }
  }
}
```

### tool_call

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "update": {
      "sessionUpdate": "tool_call",
      "toolCallId": "tool-abc-123",
      "title": "searchCapabilities",
      "kind": "other",
      "input": {"query": "fetch url"}
    }
  }
}
```

### tool_call_update (completion)

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "update": {
      "sessionUpdate": "tool_call_update",
      "toolCallId": "tool-abc-123",
      "status": "completed",
      "rawOutput": "search results...",
      "title": "searchCapabilities"
    }
  }
}
```

### query_result (REQUIRED at turn end)

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "update": {
      "sessionUpdate": "query_result",
      "cost": 0.0025,
      "input_tokens": 1250,
      "output_tokens": 340,
      "cache_creation_tokens": 0,
      "cache_read_tokens": 0,
      "total_tokens": 1590,
      "duration_ms": 3200,
      "context_tokens": 4521,
      "context_limit": 200000
    }
  }
}
```

### prompt_complete (REQUIRED at turn end, LAST event)

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "update": {
      "sessionUpdate": "prompt_complete",
      "stop_reason": "end_turn"
    }
  }
}
```

**Stop reasons**: `end_turn`, `interrupted`, `interrupt_safety_timeout`, `max_tokens`

### message_usage (REQUIRED at turn end)

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "update": {
      "sessionUpdate": "message_usage",
      "message_id": "msg-123",
      "input_tokens": 1250,
      "output_tokens": 340,
      "cache_creation_tokens": 0,
      "cache_read_tokens": 0,
      "total_tokens": 1590,
      "duration_ms": 3200
    }
  }
}
```

Required for responsible Bedrock token tracking. Display-only — host does not accumulate costs from this event.

## Turn-End Event Order

MUST be emitted in this exact order:
1. `message_usage`
2. `query_result`
3. `prompt_complete`

## Deferred Methods (Not in MVP)

- `authenticate`
- `set_session_config_option`
- `get_session_history`
- `request_permission`
- `resumeSessionId` in `new_session`
- `config_option_update` notification
- `available_commands_update` notification
