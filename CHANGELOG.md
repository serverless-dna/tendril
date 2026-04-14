# Changelog

All notable changes to the Tendril project will be documented in this file.

## [Unreleased]

### Added
- React error boundary at top level — prevents white-screen crashes, shows error + reload button
- `connection-status` Tauri event for agent lifecycle (connected, disconnected, reconnecting, error)
- Connection status listener in AgentContext — UI reflects agent state changes in real time
- Auto-reconnect on agent crash — backend emits `reconnecting` status, frontend triggers `connect_agent_cmd`
- `isChunkGroup` optional field on `DebugEntry` interface (replaces type-unsafe `_isChunkGroup` escape hatch)
- Config schema validation on `write_config` — rejects invalid types and dangerous workspace paths
- Path validation on `init_workspace` — rejects `/`, `/etc`, `/usr`, `/var`, `/System`, and `..` traversal
- System prompt shared file at `{workspace}/system-prompt.txt` — written by agent, read by Rust backend
- Zod schema for `WorkspaceConfig` in agent — single source of truth for config defaults and validation
- Save confirmation dialog in workspace file explorer before overwriting files
- File click debounce in workspace file explorer — prevents overlapping async reads on rapid clicks
- Settings panel error display — save/restart errors now shown inline instead of silently swallowed
- `writeSystemPrompt()` function in agent — writes prompt to shared file on startup

- GitHub Actions quality gate workflow — runs format, lint, and test on every PR and branch push
- GitHub Actions release workflow — manual trigger from main with semver tag, builds Tauri app, publishes GitHub Release
- PR template with Summary and Test Plan sections
- Issue templates for Bug Report and Feature Request (YAML forms)
- CodeMirror 6 editor for workspace file viewer and capability source browser (replaces hand-rolled syntax highlighting)
- Editable files in workspace with save support (Cmd+S and Save button, dirty state indicator)
- Language support: TypeScript/JSX, JSON, Markdown, Rust via CodeMirror extensions
- `write_file_content` Tauri command for saving file edits from the UI
- `reveal_in_file_explorer` Tauri command to open workspace folders and URLs in OS
- Shared `types.ts` for `Capability` and `AppConfig` interfaces used across UI components
- `validate_within_workspace()` path traversal guard on all Rust file read/write commands
- Tool name validation (snake_case only) in both Rust and TypeScript registries
- Markdown doc/code view toggle in workspace file explorer (eye icon for rendered, `<>` for source)
- Chat draft text persists across tab switches (lifted to App state)
- Global `window.open` interceptor routes all external links through OS browser via Tauri

### Changed
- All Tauri `async fn` commands now use `tokio::fs` — zero synchronous `std::fs` calls in async context
- All agent file I/O now uses `fs.promises` — zero `readFileSync`/`writeFileSync`/`existsSync` calls
- Agent process state migrated from global `OnceLock<Mutex<Option<AgentProcess>>>` to Tauri managed state (`Arc<Mutex<>>` via `app.manage()`)
- `reveal_in_file_explorer` hardened: HTTPS-only URLs opened in browser, file paths validated within workspace and revealed via `open --reveal` (macOS) instead of executed
- `window.open` override now rejects non-HTTPS URLs at frontend layer
- `list_directory` and `read_capabilities` now validate paths within workspace before reading
- `CapabilityRegistry` instantiated once as singleton in `agent.ts`, shared across all tool callbacks via closure
- Tool factories (`searchCapabilities`, `registerCapability`, `loadTool`) accept registry instance instead of workspace path
- `executeCode` tool accepts config via closure — no longer re-reads `~/.tendril/config.json` on every execution
- `readConfig` converted to async with zod schema validation (replaces `as string ??` coercion chains)
- `SettingsPanel.onSave` prop type changed from `void` to `Promise<void>` — errors now propagate to UI
- Settings panel syncs form state when config prop changes externally (via `useEffect`)
- `deepMerge` replaced with typed field-level merge for `AppConfig` in App.tsx
- `APPEND_TEXT` reducer simplified with documented state machine (3 clear cases with comments)
- `msgCounter` moved from module-level `let` to inline `Date.now() + Math.random()` in reducer (no module state)
- `lastToolCallId` moved from module-level variable to per-turn local in `onPrompt` handler
- `useEffect` cleanup in AgentContext uses `AbortController` pattern — prevents listener registration after unmount
- Sandbox temp files use `crypto.randomUUID()` filename in `os.tmpdir()` instead of predictable name in workspace
- Markdown doc view now renders `editedContent` instead of stale `selectedFile.content`
- `get_system_prompt` Rust command reads from `{workspace}/system-prompt.txt` instead of hardcoded string
- Redundant `refreshCaps` call removed from capabilities tab click handler (component loads on mount via `useEffect`)

- Agent system prompt: toolsmith identity — default is BUILD A TOOL, raw execute() restricted to single-line file reads only
- Capability registry index.json moved from workspace root into tools/ directory (co-located with implementations)
- Workspace tab header now shows real folder name and full path instead of "~/workspace"
- Breadcrumb root shows workspace folder name instead of "~/workspace"
- InputBar keeps consistent styling during processing (cancel button matches send button)
- searchCapabilities tool description now warns that skipping search causes duplicate tools
- `emitResponse`/`emitError` made private in protocol.ts (only used internally)
- `connect_agent()` holds lock through entire init to prevent race condition on double-call
- Timestamp logic deduplicated — acp.rs now uses shared `chrono_now()` from events.rs
- Deno path resolution extracted to `resolve_deno_path()` helper in acp.rs
- Config defaults extracted to named constants in both Rust and TypeScript
- Token cost rates extracted to named constants (`INPUT_COST_PER_TOKEN`, `OUTPUT_COST_PER_TOKEN`)
- Debug log max entries extracted to `MAX_DEBUG_LOG_ENTRIES` constant

### Fixed
- Registry loadIndex() crashes on empty or malformed index.json — now treats missing/corrupt `capabilities` array as empty registry instead of throwing
- Path traversal vulnerability in `read_file_content`, `write_file_content`, `read_tool_source` — now validates paths are within workspace
- Unguarded JSON.parse calls in execute.ts, protocol.ts, config.ts, registry.ts — all wrapped in try/catch
- All `unwrap()` calls in Rust replaced with proper `?` / `.ok_or()` / `.map_err()` error propagation
- Stale system prompt in `get_system_prompt()` Rust command — synced with actual agent prompt
- Missing useEffect dependencies in CapabilityBrowser (`onRefresh`) and FileExplorer (`handleSave`)
- setTimeout memory leak in SettingsPanel — now cleaned up on unmount
- `as never` type assertions in App.tsx replaced with proper typed interfaces
- `require('node:crypto')` replaced with ES module import in protocol.ts
- CodeMirror scroll not working — added `min-h-0` through entire flex chain
- Open in Finder failing with URL regex validation — replaced shell plugin with native Tauri command
- Unused `app` parameter in `send_prompt` Rust command

### Removed
- `uuid` crate from Cargo.toml (was unused)
- `_app` parameter from `send_prompt` Tauri command (was unused)
- `write_to_agent` wrapper function from acp.rs — callers use `write_to_agent_logged` directly
- `CapabilityRegistry.exists()` and `CapabilityRegistry.list()` methods (were unused)
- Hardcoded system prompt from `lib.rs` `get_system_prompt` (moved to shared file written by agent)
- `_isChunkGroup` type assertion escape hatch from AgentContext debug log
- `deepMerge` function from App.tsx (replaced with typed merge)
- Global `OnceLock<Mutex<Option<AgentProcess>>>` and `agent_state()` from acp.rs
- Module-level `let msgCounter` from AgentContext.tsx
- Module-level `let lastToolCallId` from agent index.ts
- `WorkspaceConfig` type from `types.ts` agent-side (now derived from zod schema in config.ts)

- `useSession.ts` hook — duplicated event listener already handled by AgentContext
- `AcpResponse` and `AcpNotification` types — defined but never used
- `session_id` field and `#[allow(dead_code)]` annotation from AgentProcess struct
- Hand-rolled `highlightCode()` and `highlightTypeScript()` functions (replaced by CodeMirror)

- Project specification and implementation plan for Tendril Tauri application
- Constitution v2.0.0 with 7 core principles for async-first architecture
- tendril-agent TypeScript sidecar: ACP protocol handler, Strands SDK integration, capability registry, Deno sandbox, bootstrap tools (searchCapabilities, registerCapability, loadTool, execute)
- tendril-ui Tauri + React desktop app: ACP host handler, event forwarding, conversation UI with streaming, tool trace display, token usage tracking, capability browser, workspace initialisation, settings panel
- Node.js SEA build pipeline (esbuild + postject) for standalone agent binary
- Tauri sidecar configuration for bundling both tendril-agent and Deno binaries
- Full ACP Agent Integrator Specification v1.0.0 compliance (MVP subset: initialize, new_session, prompt, cancel, shutdown)
- TailwindCSS v4 styling across all React components
- Makefile with dev, build, test, sea, release, and clean targets
- Deno binary auto-downloaded and bundled as Tauri sidecar (pinned v2.7.12)
- App config at ~/.tendril/config.json — persists workspace path, model, AWS profile, sandbox settings
- README with agent loop walkthrough, architecture diagram, and quick start guide
