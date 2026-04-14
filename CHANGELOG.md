# Changelog

All notable changes to the Tendril project will be documented in this file.

## [Unreleased]

### Added
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
