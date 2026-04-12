# tendril-ui

The desktop frontend for Tendril — a [Tauri 2.x](https://tauri.app) application with a React 18 frontend styled with TailwindCSS v4. Communicates with the `tendril-agent` sidecar over the ACP protocol.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React Frontend (WebView)                               │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ AgentProvider│  │  Components  │  │    Hooks      │  │
│  │             │  │              │  │               │  │
│  │ All Tauri   │  │ ChatView     │  │ useAgent()    │  │
│  │ event       │  │ ToolTrace    │  │  sendPrompt   │  │
│  │ listeners   │  │ TokenUsage   │  │  cancelPrompt │  │
│  │      │      │  │ InputBar     │  │               │  │
│  │      ▼      │  │ Capability   │  │ useCapabilities│ │
│  │ React State │  │  Browser     │  │               │  │
│  │ (useReducer)│  │ FileExplorer │  └───────────────┘  │
│  │             │  │ SettingsPanel│                      │
│  │             │  │ DebugPanel   │                      │
│  └──────┬──────┘  └──────┬───────┘                      │
│         │   context/props │                              │
│         └────────►────────┘                              │
│                                                         │
│         invoke()              listen()                   │
│            │                     ▲                       │
└────────────┼─────────────────────┼───────────────────────┘
             │                     │
             ▼                     │
┌────────────────────────────────────────────────────────┐
│  Tauri Rust Backend (src-tauri)                        │
│                                                        │
│  lib.rs — Tauri commands (async)                       │
│    send_prompt, cancel_prompt, restart_agent           │
│    init_workspace, read_config, write_config           │
│    read_capabilities, read_tool_source                 │
│    list_directory, read_file_content                   │
│                                                        │
│  acp.rs — ACP host                                     │
│    Spawns tendril-agent sidecar                        │
│    Sends JSON-RPC 2.0 over stdin                       │
│    Resolves deno sidecar path                          │
│                                                        │
│  events.rs — Event bridge                              │
│    Reads NDJSON from agent stdout                      │
│    Emits Tauri events to frontend                      │
│    Forwards debug events (agent-debug)                 │
│                                                        │
│  Sidecars:                                             │
│    binaries/tendril-agent-{triple}                     │
│    binaries/deno-{triple}                              │
└────────────────────────────────────────────────────────┘
```

## State Management

All Tauri event listening happens in **one place**: `AgentContext.tsx` (`AgentProvider`).

```
Tauri Events ──► AgentProvider (useEffect + listen) ──► useReducer ──► React State
                                                                           │
                                                                           ▼
                                                                     Components
                                                                   (read via context)
```

Components never import Tauri APIs directly. They read state from context and call actions via `useAgent()`.

## Views

| Tab | Component | Purpose |
|-----|-----------|---------|
| Chat | `ChatView` | Conversation with streaming text, tool traces, token usage |
| Capabilities | `CapabilityBrowser` | Browse registered tools, click to view source with syntax highlighting |
| Workspace | `FileExplorer` | Browse workspace files (index.json, tools/*.ts) with code viewer |
| Settings | `SettingsPanel` | Model, region, AWS profile, sandbox timeout, system prompt display |
| Debug | `DebugPanel` (side panel) | Real-time ACP protocol traffic, collapsible right panel |

## Components

| Component | Props / Data source | Description |
|-----------|-------------------|-------------|
| `ChatView` | `useAgent()` state | Message list, streaming text, tool traces, input bar |
| `MessageBubble` | `role`, `text` | User (blue, right) or assistant (gray, left) message |
| `ToolTrace` | `title`, `input`, `status`, `output` | Expandable tool call with input summary and output |
| `TokenUsage` | token counts, cost, duration | Inline usage display after each turn |
| `InputBar` | `onSubmit`, `isProcessing` | Multi-line textarea, Enter to send, Shift+Enter for newline |
| `CapabilityBrowser` | capabilities array | Card list with expandable source code viewer |
| `FileExplorer` | `workspacePath` | Split-pane directory tree + file content viewer |
| `SettingsPanel` | config object | Form fields + read-only system prompt |
| `DebugPanel` | debug log from context | Protocol message log with timestamps |
| `WorkspaceSetup` | `onInit` callback | First-run folder picker |
| `TendrilLogo` | `size` | Pixel art SVG, scales to any size |

## Tauri Commands (Rust → Frontend)

All commands are **async**. No synchronous I/O on the main thread.

| Command | Description |
|---------|-------------|
| `send_prompt(text)` | Send user message to agent |
| `cancel_prompt()` | Cancel active prompt |
| `connect_agent_cmd()` | Spawn and connect to agent sidecar |
| `restart_agent()` | Kill and respawn agent (after settings change) |
| `init_workspace(path)` | Create workspace directory structure |
| `read_config()` | Read `~/.tendril/config.json` |
| `write_config(config)` | Write `~/.tendril/config.json` |
| `read_capabilities(path)` | Read `index.json` capabilities |
| `read_tool_source(workspace, name)` | Read `tools/{name}.ts` |
| `list_directory(dir_path)` | List directory contents (sorted, no dotfiles) |
| `read_file_content(file_path)` | Read file content (1MB limit) |
| `get_system_prompt()` | Get the rendered system prompt |

## Tauri Events (Agent → Frontend)

All events are listened to in `AgentProvider` and dispatched to the reducer.

| Event | Payload | Reducer Action |
|-------|---------|---------------|
| `session-lifecycle` | `{ stage, ... }` | `SET_CONNECTION_STATUS` |
| `agent-message-chunk` | `{ text }` | `START_ASSISTANT_MESSAGE` + `APPEND_TEXT` |
| `tool-call` | `{ toolCallId, title, kind, input }` | `ADD_TOOL_CALL` |
| `tool-call-update` | `{ toolCallId, status, rawOutput }` | `UPDATE_TOOL_CALL` |
| `query-result` | `{ cost, input_tokens, ... }` | `SET_USAGE` |
| `prompt-complete` | `{ stop_reason }` | `PROMPT_COMPLETE` |
| `agent-error` | `{ message }` | `SET_ERROR` |
| `agent-debug` | `{ direction, message, timestamp }` | Debug log buffer |

## Build

```bash
npm install
cargo tauri dev       # Development (with Vite HMR)
cargo tauri build     # Production
```

Requires sidecars in `src-tauri/binaries/` — use `make sidecars` from the repo root.

## Dependencies

**Frontend:** React 18, TailwindCSS v4 (`@tailwindcss/vite`), `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-shell`

**Rust:** `tauri 2`, `tauri-plugin-shell`, `tauri-plugin-dialog`, `serde`, `serde_json`, `thiserror`, `tokio`, `dirs`
