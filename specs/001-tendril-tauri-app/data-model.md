# Data Model: Tendril Tauri Application

**Branch**: `001-tendril-tauri-app` | **Date**: 2026-04-11

## Entities

### Workspace

The root directory for all Tendril data. Contains the registry, tools, and config.

| Attribute | Type | Description |
|-----------|------|-------------|
| path | string (absolute) | Filesystem path to the workspace root |
| index_path | string | `{path}/index.json` |
| tools_path | string | `{path}/tools/` |
| config_path | string | `{path}/.tendril/config.json` |

**Lifecycle**: Created once via workspace initialisation. Persists across sessions.

### CapabilityRegistry (index.json)

| Attribute | Type | Description |
|-----------|------|-------------|
| version | string | Schema version (semver) |
| capabilities | Capability[] | Array of registered capabilities |

### Capability

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | YES | snake_case identifier, unique |
| capability | string | YES | One-sentence description of what the tool does |
| triggers | string[] | YES | 2-5 observable conversational signals for invocation |
| suppression | string[] | YES | Conditions that prevent invocation |
| tool_path | string | YES | Relative path to TypeScript implementation |
| created | string | YES | ISO date (YYYY-MM-DD) |
| created_by | "model" \| "human" | YES | Who authored the capability |
| version | string | YES | Semver of the capability |

**Lifecycle**: Created by `registerCapability` tool. Persists in index.json. Updated in-place if name matches.

### Config (.tendril/config.json)

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| model.provider | string | "bedrock" | Inference provider |
| model.modelId | string | "us.anthropic.claude-sonnet-4-5" | Bedrock model ID |
| model.region | string | "us-east-1" | AWS region |
| sandbox.denoPath | string | "deno" | Path to Deno binary |
| sandbox.timeoutMs | number | 45000 | Execution timeout in ms |
| sandbox.allowedDomains | string[] | ["esm.sh","deno.land","cdn.jsdelivr.net"] | Network allowlist |
| registry.maxCapabilities | number | 500 | Registry size limit |
| agent.maxTurns | number | 100 | Max agentic loop turns per prompt |

**Lifecycle**: Created during workspace init with defaults. Updated by settings UI.

### Session

| Attribute | Type | Description |
|-----------|------|-------------|
| sessionId | string (UUID) | Unique session identifier |
| workspacePath | string | Associated workspace |
| messages | Message[] | Conversation history (managed by Strands) |

**Lifecycle**: Created on `new_session`. Exists in-memory during the agent process lifetime. Session persistence deferred.

### Turn

A single prompt-response cycle within a session.

| Attribute | Type | Description |
|-----------|------|-------------|
| promptId | string | JSON-RPC request ID for this turn |
| inputTokens | number | Tokens consumed by input |
| outputTokens | number | Tokens generated |
| cost | number | Computed USD cost |
| durationMs | number | Wall-clock duration |
| stopReason | string | end_turn, interrupted, max_tokens |

**Lifecycle**: Created on `prompt` request. Completed on `prompt_complete`.

## Relationships

```
Workspace 1──* Capability    (via index.json)
Workspace 1──1 Config        (via .tendril/config.json)
Session   1──* Turn          (in-memory during agent lifetime)
Turn      1──* ToolCall      (within agentic loop)
```

## State Transitions

### Agent Session State

```
Uninitialized → Initializing → Ready → Processing → Ready (loop)
                                  ↓
                               Shutdown
```

### Tool Call State

```
Announced → In Progress → Completed
                        → Failed
```
