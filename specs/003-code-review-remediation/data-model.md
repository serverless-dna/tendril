# Data Model: Code Review Remediation

**Feature**: 003-code-review-remediation  
**Date**: 2026-04-15

This feature primarily remediates existing code rather than introducing new entities. The data model changes are minimal — mostly refining existing structures.

## Modified Entities

### AppConfig (Rust — Tauri Managed State)

New cached state structure replacing per-call disk reads.

| Field | Type | Description |
|-------|------|-------------|
| workspace | `Option<String>` | Configured workspace path |
| raw | `Value` | Full parsed JSON config (passed to frontend as-is) |

**Lifecycle**: Read from `~/.tendril/config.json` on startup. Updated in-memory after `write_config`. Rust backend only extracts `workspace` — all other values are consumed by the agent or frontend.

**Previous state**: No caching — `read_app_config_inner()` read from disk on every command invocation.

### AgentProcess (Rust — Tauri Managed State)

Migrated from global `OnceLock<Mutex<Option<AgentProcess>>>` to `app.manage(Mutex<Option<AgentProcess>>)`.

| Field | Type | Description |
|-------|------|-------------|
| child | `CommandChild` | Sidecar process handle |
| prompt_counter | `u32` | Monotonic prompt ID counter |
| app | `AppHandle` | Tauri app handle for event emission |

**Lifecycle**: Created on `connect_agent`. Cleared on agent termination or `restart_agent`. Auto-reconnect creates a new instance after crash detection.

**Previous state**: Global `OnceLock<Mutex<Option<AgentProcess>>>` — same fields, different storage mechanism.

### WorkspaceConfig (TypeScript — Zod Schema)

Replaced type-coercion parsing with zod schema validation.

| Field | Type | Default | Validation |
|-------|------|---------|------------|
| model.provider | `string` | `"bedrock"` | Non-empty string |
| model.modelId | `string` | `"us.anthropic.claude-sonnet-4-5-20250514"` | Non-empty string (required) |
| model.region | `string` | `"us-east-1"` | Non-empty string (required) |
| model.profile | `string?` | `undefined` | Optional string |
| sandbox.denoPath | `string` | `"deno"` | Non-empty string |
| sandbox.timeoutMs | `number` | `45000` | Positive integer |
| sandbox.allowedDomains | `string[]` | `[]` | Array of strings |
| registry.maxCapabilities | `number` | `500` | Positive integer |
| agent.maxTurns | `number` | `100` | Positive integer |

**Previous state**: Same fields, parsed via `as string ??` coercion chains. No runtime type validation.

### DebugEntry (TypeScript — AgentContext)

| Field | Type | Description |
|-------|------|-------------|
| ...existing fields | | Unchanged |
| isChunkGroup | `boolean?` | Optional flag for chunk grouping (was `_isChunkGroup` via type assertion) |

**Previous state**: `_isChunkGroup` added via `as DebugEntry & { _isChunkGroup: boolean }` type escape hatch.

### CapabilityRegistry (TypeScript — Singleton)

No structural changes. Lifecycle change only:

**Previous state**: Instantiated fresh in each tool callback (`new CapabilityRegistry(workspacePath)` in search.ts, register.ts, load.ts).  
**New state**: Instantiated once in `agent.ts` and passed to all tool factories via closure.

## Removed Entities

### Rust Config Defaults

Removed constants and function:
- `DEFAULT_TIMEOUT_MS`
- `DEFAULT_MAX_CAPABILITIES`  
- `DEFAULT_MAX_TURNS`
- `default_app_config()`

**Rationale**: Config defaults owned exclusively by the TypeScript agent.

## New Files

### `{workspace}/system-prompt.txt`

Plain text file containing the system prompt. Written by the agent on startup. Read by the Rust backend's `get_system_prompt` command.

**Lifecycle**: Written once on agent startup if missing or outdated. Read by Rust backend on demand for Settings panel display.
