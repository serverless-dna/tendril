# Contract: Connection Status Events

**Feature**: 003-code-review-remediation  
**Date**: 2026-04-15

## Overview

New Tauri event for communicating agent connection status changes to the frontend. This replaces the current pattern where agent termination is only reported via `agent-debug` without updating the connection state.

## Event: `connection-status`

**Direction**: Tauri backend → React frontend  
**Trigger**: Agent process lifecycle changes (spawn, termination, reconnection)

### Payload Schema

```json
{
  "status": "connected" | "disconnected" | "reconnecting" | "error",
  "message": "string (optional, human-readable context)",
  "timestamp": "string (ISO 8601)"
}
```

### State Transitions

```
App Start → connecting → connected (agent spawned + initialize sent)
                       → error (spawn failed)

Connected → disconnected (agent process terminated)
         → disconnected (agent IO error)

Disconnected → reconnecting (auto-reconnect triggered, 2s delay)
            → connected (manual reconnect via restart_agent)

Reconnecting → connected (reconnect succeeded)
            → error (3 consecutive reconnect failures)

Error → connecting (user-triggered reconnect)
```

### Frontend Handling

The `AgentContext` provider listens for `connection-status` events and updates `connectionStatus` in the reducer state. The UI renders status indicators based on this state:

- `connected`: Normal operation
- `disconnected`: Warning banner, disable prompt input
- `reconnecting`: Spinner + "Reconnecting..." message
- `error`: Error banner with manual "Reconnect" button

## Contract: `write_config` Schema Validation

### Input Validation

The `write_config` Tauri command validates the incoming JSON payload before writing to disk. Validation rules:

| Field | Type | Constraint |
|-------|------|-----------|
| workspace | `string?` | If present, must not be empty. Must not be `/`, `/etc`, `/usr`, or any system directory root. |
| model | `object?` | If present, nested fields validated per sub-schema. |
| model.modelId | `string?` | Non-empty if present. |
| model.region | `string?` | Non-empty if present. |
| sandbox.timeoutMs | `number?` | Positive integer if present. |
| sandbox.allowedDomains | `array?` | Array of non-empty strings if present. |
| registry.maxCapabilities | `number?` | Positive integer if present. |
| agent.maxTurns | `number?` | Positive integer if present. |

Unknown top-level keys are preserved (forward compatibility) but not validated.

## Contract: `reveal_in_file_explorer` Input Handling

### URL Path (HTTPS)

```
Input: "https://example.com/path"
Action: Open in default browser via OS command
Validation: Must match ^https:// (http:// rejected)
```

### File Path (Workspace)

```
Input: "/Users/me/workspace/file.txt"  
Action: Reveal in file manager (Finder/Explorer) without executing
Validation: Must resolve (canonicalize) to within the configured workspace
macOS: open --reveal <path>
Windows: explorer /select,<path>
Linux: xdg-open <parent-directory>
```

### Rejected Input

```
Input: "file:///Applications/Calculator.app"
Input: "http://example.com" (non-HTTPS)
Input: "/etc/passwd" (outside workspace)
Input: "javascript:alert(1)"
Action: Return error, do not execute
```
