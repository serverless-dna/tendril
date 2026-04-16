# Implementation Plan: Code Review Remediation

**Branch**: `code-review` | **Date**: 2026-04-15 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/003-code-review-remediation/spec.md`

## Summary

Remediate 30+ findings from a comprehensive code review across the tendril-ui (Tauri 2.x + React) and tendril-agent (Node.js sidecar) codebases. Findings span seven categories: security vulnerabilities (P0), async/sync violations (P1), agent crash recovery (P1), code duplication (P2), UI/UX design issues (P2), dead code removal (P3), and code smells (P3). The implementation follows priority order, ensuring security fixes land first, followed by reliability improvements, then quality improvements.

## Technical Context

**Language/Version**: Rust (stable, Tauri 2.x backend), TypeScript 5.7+ (React 18 frontend, Node.js 22 agent)  
**Primary Dependencies**: Tauri 2.x, React 18, tokio 1.x, serde_json 1.x, @strands-agents/sdk, zod 4.x, esbuild  
**Storage**: `~/.tendril/config.json` (app config), `{workspace}/tools/index.json` (capability registry)  
**Testing**: `cargo test` (Rust), `vitest` (TypeScript agent), React component tests  
**Target Platform**: macOS (primary), Windows, Linux (secondary)  
**Project Type**: Desktop application (Tauri + React + Node.js sidecar)  
**Performance Goals**: UI remains responsive (no frame drops > 100ms) during all operations  
**Constraints**: Single workspace, single user, single provider (per constitution)  
**Scale/Scope**: Two packages (tendril-ui, tendril-agent), ~15 source files affected

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Async-First, Non-Blocking | **REMEDIATE** | Currently violated by sync `std::fs` in async commands and sync FS in agent. This feature fixes the violations. |
| II. Event-Driven State | **REMEDIATE** | Agent crash doesn't emit connection status events. Adding `connection-status` event aligns with this principle. |
| III. Component Isolation | **PASS** | Error boundary addition is compatible. Components remain state-driven. |
| IV. Protocol Compliance | **REMEDIATE** | `connect_agent` uses `sleep(500ms)` instead of protocol response. Fixing to wait for actual response. |
| V. Sandboxed Execution | **REMEDIATE** | Temp file uses predictable name in workspace. Fixing to use random name in OS temp dir. |
| VI. Test-First | **PASS** | All changes will have corresponding tests. |
| VII. Simplicity | **PASS** | No new abstractions. System prompt shared via file, not protocol extension. Config validation via existing zod dependency. |

**Pre-design gate**: PASS — all violations are being remediated by this feature.

### Post-Design Re-check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Async-First | **PASS** | All FS operations converted to async. Config cached to avoid disk reads. |
| II. Event-Driven State | **PASS** | `connection-status` event added for agent lifecycle. |
| III. Component Isolation | **PASS** | Error boundary is a standard React pattern. No new Tauri API imports in components. |
| IV. Protocol Compliance | **PASS** | Initialize waits for actual response. |
| V. Sandboxed Execution | **PASS** | Temp files in OS temp dir with random names. |
| VI. Test-First | **PASS** | Test plan covers all changes. |
| VII. Simplicity | **PASS** | No unnecessary abstractions added. |

## Project Structure

### Documentation (this feature)

```text
specs/003-code-review-remediation/
├── plan.md              # This file
├── research.md          # Phase 0 output — 14 research decisions
├── data-model.md        # Phase 1 output — entity changes
├── quickstart.md        # Phase 1 output — build & verify
├── contracts/
│   └── status-events.md # Phase 1 output — new event contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
tendril-ui/
├── src/
│   ├── main.tsx                    # window.open override (security fix)
│   ├── App.tsx                     # Error boundary, deepMerge removal, settings sync
│   ├── context/
│   │   └── AgentContext.tsx         # msgCounter, _isChunkGroup, APPEND_TEXT, cleanup race
│   ├── components/
│   │   ├── FileExplorer.tsx         # Click debounce, doc view fix, save confirmation
│   │   └── SettingsPanel.tsx        # External config sync
│   └── types.ts                    # DebugEntry type update
├── src-tauri/
│   ├── Cargo.toml                  # Remove uuid crate
│   └── src/
│       ├── lib.rs                  # Security fixes, async migration, config caching, dead code
│       ├── acp.rs                  # Managed state, crash recovery, sleep→response wait
│       └── events.rs               # (minimal changes)

tendril-agent/
├── src/
│   ├── index.ts                    # lastToolCallId refactor, registry singleton
│   ├── config.ts                   # Zod schema validation, async FS
│   ├── registry.ts                 # Async FS, remove unused methods
│   ├── sandbox.ts                  # Async FS, secure temp files
│   ├── prompt.ts                   # System prompt file I/O
│   ├── agent.ts                    # Registry singleton, config passthrough
│   └── tools/
│       ├── execute.ts              # Remove readConfig() call, accept config via closure
│       ├── search.ts               # Accept registry via closure
│       ├── register.ts             # Accept registry via closure
│       └── load.ts                 # Accept registry via closure
```

**Structure Decision**: Existing monorepo structure with `tendril-ui/` and `tendril-agent/` packages. No new packages or directories introduced. Changes are surgical edits to existing files.

## Complexity Tracking

No complexity violations. All changes simplify existing code or add minimal defensive logic (validation, error boundaries). No new abstractions, patterns, or dependencies beyond what the constitution already mandates.

## Implementation Phases

### Phase 1: Security (P0) — FR-001 through FR-007

**Scope**: All security findings. Must be completed before any other phase.

1. **`reveal_in_file_explorer` hardening** (FR-001, FR-002)
   - Split into URL vs file path handling
   - URLs: validate `https://` scheme only, open in default browser
   - Files: `validate_within_workspace()`, then `open --reveal` (macOS), `explorer /select,` (Windows), `xdg-open` parent dir (Linux)
   - Update `window.open` override in `main.tsx` to pass URL type hint

2. **`list_directory` workspace validation** (FR-003)
   - Add `validate_within_workspace()` call before `read_dir`

3. **`read_capabilities` workspace validation** (FR-004)
   - Add `validate_within_workspace()` call before reading index

4. **`write_config` schema validation** (FR-005)
   - Add basic JSON schema validation before `write_app_config_inner`
   - Validate known field types, reject dangerous workspace paths

5. **`init_workspace` path validation** (FR-006)
   - Reject `/`, system directory roots, and paths with `..`

6. **Sandbox temp file security** (FR-007)
   - Use `crypto.randomUUID()` for filename
   - Write to `os.tmpdir()` instead of workspace

### Phase 2: Async Migration (P1) — FR-008 through FR-011

**Scope**: All async/sync violations.

1. **Rust async FS migration** (FR-008)
   - Replace `std::fs` with `tokio::fs` in all `async fn` commands
   - Update `validate_within_workspace` to async (uses `fs::canonicalize`)
   - Update `read_app_config_inner`, `write_app_config_inner` to async
   - Add `tokio = { features = ["fs"] }` to Cargo.toml

2. **Agent async FS migration** (FR-009)
   - Convert `registry.ts`: `readFileSync` → `fs.promises.readFile`, etc.
   - Convert `sandbox.ts`: `writeFileSync` → `fs.promises.writeFile`, etc.
   - Convert `config.ts`: `readFileSync` → `fs.promises.readFile`
   - Update all callers to `await`

3. **Initialize response wait** (FR-010)
   - Replace `tokio::time::sleep(500ms)` with actual JSON-RPC response parsing
   - Wait for response with `id: "init-1"` with a timeout

4. **Settings error propagation** (FR-011)
   - Make `onSave` return `Promise<void>` in SettingsPanel props
   - Surface errors in handleSaveConfig to UI (toast or inline error)

### Phase 3: Agent Crash Recovery (P1) — FR-012 through FR-015

**Scope**: Robustness and reliability.

1. **Agent state migration to Tauri managed state** (FR-025, prerequisite)
   - Replace global `OnceLock<Mutex<Option<AgentProcess>>>` with `app.manage()`
   - Update all command handlers to accept `State<'_, Mutex<Option<AgentProcess>>>`

2. **Crash detection and status events** (FR-012)
   - In `CommandEvent::Terminated` handler, emit `connection-status` event with `disconnected`
   - Clear agent state on termination

3. **Auto-reconnection** (FR-013)
   - After detecting crash, wait 2s then attempt `connect_agent`
   - Max 3 retries with 2s intervals
   - After 3 failures, emit `connection-status` with `error`

4. **Cleanup race fix** (FR-014)
   - Implement `AbortController` pattern in AgentContext `setup()`
   - Store all listener unsubscribe functions
   - Check abort signal before registering new listeners

5. **Config caching** (FR-015)
   - Add `AppConfigCache` to Tauri managed state
   - Read from disk once on startup
   - Update cache after `write_config`
   - `configured_workspace()` and `validate_within_workspace()` read from cache

### Phase 4: Deduplication (P2) — FR-016 through FR-020

**Scope**: Single source of truth for config, prompts, validation.

1. **System prompt consolidation** (FR-016)
   - Agent writes `{workspace}/system-prompt.txt` on startup
   - Remove hardcoded prompt from `lib.rs` `get_system_prompt`
   - `get_system_prompt` reads from the file instead

2. **Config defaults consolidation** (FR-017)
   - Remove `DEFAULT_TIMEOUT_MS`, `DEFAULT_MAX_CAPABILITIES`, `DEFAULT_MAX_TURNS` from lib.rs
   - Remove `default_app_config()` from lib.rs
   - Rust backend reads config as untyped `Value`, only extracts `workspace`

3. **Tool name validation consolidation** (FR-018)
   - Define `VALID_TOOL_NAME` regex constant in both Rust and TS from same pattern
   - Add comment referencing the canonical definition

4. **Config read-once for execute** (FR-019)
   - Pass config to `executeCode` tool factory via closure
   - Remove `readConfig()` call from execute callback

5. **Registry singleton** (FR-020)
   - Instantiate `CapabilityRegistry` once in agent setup
   - Pass to all tool factories: `searchCapabilities(registry)`, `registerCapability(registry)`, `loadTool(registry)`, `executeCode(workspacePath, config)`

### Phase 5: UI/UX (P2) — FR-031 through FR-035

**Scope**: UI resilience and correctness.

1. **React error boundary** (FR-031)
   - Add `ErrorBoundary` class component in `App.tsx`
   - Wrap `AppContent` with error boundary
   - Display error message + "Reload" button

2. **Settings panel sync** (FR-032)
   - Add `useEffect` to sync form state when `config` prop changes
   - Or use `key={JSON.stringify(config)}` for remount approach

3. **File explorer click debounce** (FR-033)
   - Add loading guard: if a read is in progress, ignore new clicks
   - Or cancel previous read when a new click arrives

4. **Markdown doc view fix** (FR-034)
   - Render `editedContent` instead of `selectedFile.content` in doc mode

5. **File save confirmation** (FR-035)
   - Add confirmation dialog before `write_file_content` in FileExplorer

### Phase 6: Dead Code & Smells (P3) — FR-021 through FR-030

**Scope**: Code cleanliness.

1. **Remove `uuid` crate** (FR-021)
   - Delete from `Cargo.toml`

2. **Remove `_app` parameter** (FR-022)
   - Remove from `send_prompt` signature (or use it to replace `write_to_agent`)

3. **Remove `write_to_agent` wrapper** (FR-023)
   - Callers (`send_prompt`, `send_cancel`) use `write_to_agent_logged` directly
   - Pass `app` handle via managed state or parameter

4. **Remove unused registry methods** (FR-024)
   - Remove `CapabilityRegistry.exists()` and `CapabilityRegistry.list()`

5. **`_isChunkGroup` proper typing** (FR-026)
   - Add optional `isChunkGroup?: boolean` to `DebugEntry` interface
   - Remove type assertion escape hatches

6. **`msgCounter` to useRef** (FR-027)
   - Move inside `AgentProvider` as `useRef(0)`

7. **`lastToolCallId` per-event tracking** (FR-028)
   - Track in event handler scope, not module-level

8. **`deepMerge` replacement** (FR-029)
   - Replace with typed field-level merge for `AppConfig`
   - Or use structured `Partial<AppConfig>` merge

9. **Config zod schema** (FR-030)
   - Define zod schema for `WorkspaceConfig`
   - Replace `as string ??` chains with `schema.parse(raw)`
   - Derive TypeScript types from schema

10. **`APPEND_TEXT` reducer simplification** (code smell 5.4)
    - Simplify the three-branch logic
    - Document the state machine clearly
