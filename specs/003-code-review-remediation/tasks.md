# Tasks: Code Review Remediation

**Input**: Design documents from `specs/003-code-review-remediation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/status-events.md

**Organization**: Tasks grouped by user story priority. No test tasks generated (not requested in spec). Each user story is independently implementable after foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Exact file paths included in all descriptions

---

## Phase 1: Setup

**Purpose**: Dependency and configuration changes required before any code changes.

- [x] T001 Add `tokio = { version = "1", features = ["sync", "fs", "time"] }` to `tendril-ui/src-tauri/Cargo.toml` (update existing tokio entry to include `fs` and `time` features)

**Checkpoint**: Build dependencies updated. `cargo check` passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure changes that multiple user stories depend on. MUST complete before user story work begins.

**⚠️ CRITICAL**: The async migration of core helpers and managed state migration are prerequisites for security fixes, crash recovery, and deduplication stories.

- [x] T002 Migrate `validate_within_workspace` to async in `tendril-ui/src-tauri/src/lib.rs` — replace `std::fs::canonicalize` with `tokio::fs::canonicalize`, change signature to `async fn validate_within_workspace(target: &Path) -> Result<(), String>`
- [x] T003 Migrate `read_app_config_inner` to async in `tendril-ui/src-tauri/src/lib.rs` — replace `std::fs::read_to_string` with `tokio::fs::read_to_string`, change signature to `async fn`
- [x] T004 Migrate `write_app_config_inner` to async in `tendril-ui/src-tauri/src/lib.rs` — replace `std::fs::create_dir_all` and `std::fs::write` with `tokio::fs` equivalents, change signature to `async fn`
- [x] T005 Migrate agent process state from global `OnceLock<Mutex<Option<AgentProcess>>>` to Tauri managed state in `tendril-ui/src-tauri/src/acp.rs` — use `app.manage(Mutex::new(None::<AgentProcess>))` in `lib.rs:run()`, update `connect_agent`, `restart_agent`, `send_prompt`, `send_cancel` to accept `State<'_, Mutex<Option<AgentProcess>>>`, remove `static AGENT` and `agent_state()`
- [x] T006 Update all `async fn` Tauri command signatures in `tendril-ui/src-tauri/src/lib.rs` to propagate the new async helpers — update callers of `validate_within_workspace`, `read_app_config_inner`, `write_app_config_inner` to `.await`
- [x] T007 Convert `CapabilityRegistry` methods to async in `tendril-agent/src/registry.ts` — replace `fs.readFileSync`/`fs.writeFileSync`/`fs.existsSync`/`fs.mkdirSync` with `fs.promises` equivalents, make `loadIndex`, `saveIndex`, `search`, `register`, `load` all `async`
- [x] T008 Convert `readConfig` to async in `tendril-agent/src/config.ts` — replace `fs.existsSync`/`fs.readFileSync` with `fs.promises.access`/`fs.promises.readFile`, change signature to `async function readConfig`
- [x] T009 Update `tendril-agent/src/index.ts` top-level to `await readConfig()` — wrap initialization in an async IIFE or top-level await, update all callers of async registry/config functions

**Checkpoint**: `cargo check` passes with async helpers. `npm run build` passes in tendril-agent. All existing functionality preserved with async signatures.

---

## Phase 3: User Story 1 — Secure Command Execution (Priority: P0) 🎯 MVP

**Goal**: Eliminate all security vulnerabilities: command injection via `reveal_in_file_explorer`, missing workspace validation on `list_directory`/`read_capabilities`, unvalidated `write_config`, unsafe `init_workspace` paths, predictable sandbox temp files.

**Independent Test**: Attempt malicious URLs, out-of-workspace paths, crafted config payloads, dangerous init paths. All must be rejected.

### Implementation for User Story 1

- [x] T010 [US1] Harden `reveal_in_file_explorer` in `tendril-ui/src-tauri/src/lib.rs` — split into URL vs file path: validate HTTPS-only URLs (reject `http://`, `file://`, other schemes), validate file paths with `validate_within_workspace()`, use `open --reveal` on macOS / `explorer /select,` on Windows / `xdg-open` on parent dir on Linux
- [x] T011 [US1] Update `window.open` override in `tendril-ui/src/main.tsx` — add URL scheme validation before invoking `reveal_in_file_explorer`, reject non-HTTPS URLs at the frontend layer
- [x] T012 [US1] Add workspace validation to `list_directory` in `tendril-ui/src-tauri/src/lib.rs` — call `validate_within_workspace()` on the expanded path before `tokio::fs::read_dir`
- [x] T013 [US1] Add workspace validation to `read_capabilities` in `tendril-ui/src-tauri/src/lib.rs` — call `validate_within_workspace()` on the expanded path before reading `tools/index.json`
- [x] T014 [US1] Add schema validation to `write_config` in `tendril-ui/src-tauri/src/lib.rs` — validate known field types (workspace: non-empty string not `/`/`/etc`/`/usr`; timeoutMs: positive number; maxCapabilities: positive number; maxTurns: positive number), reject payloads that fail validation
- [x] T015 [US1] Add path validation to `init_workspace` in `tendril-ui/src-tauri/src/lib.rs` — reject `/`, system directory roots (`/etc`, `/usr`, `/var`, `/System`), and paths containing `..` traversal
- [x] T016 [P] [US1] Secure sandbox temp files in `tendril-agent/src/sandbox.ts` — replace `Date.now()` with `crypto.randomUUID()` in filename, change temp file location from `workspacePath` to `os.tmpdir()`, update cleanup in `finally` block
- [x] T017 [US1] Migrate `init_workspace` to async FS in `tendril-ui/src-tauri/src/lib.rs` — replace `fs::create_dir_all`, `fs::write` with `tokio::fs` equivalents (depends on T002–T004)

**Checkpoint**: All security acceptance scenarios pass. No unsanitized paths reach OS commands. `cargo check` clean.

---

## Phase 4: User Story 2 — Non-Blocking Async Operations (Priority: P1)

**Goal**: Eliminate all synchronous file I/O in async contexts across Rust backend and Node.js agent. Replace sleep-based sync barrier with protocol response wait. Propagate settings errors to UI.

**Independent Test**: Scan directories with 10k+ entries without UI freeze. Verify no `std::fs` in async command bodies, no `readFileSync`/`writeFileSync` in agent.

### Implementation for User Story 2

- [x] T018 [US2] Migrate `read_file_content` to async FS in `tendril-ui/src-tauri/src/lib.rs` — replace `fs::metadata` and `fs::read_to_string` with `tokio::fs` equivalents
- [x] T019 [P] [US2] Migrate `write_file_content` to async FS in `tendril-ui/src-tauri/src/lib.rs` — replace `fs::write` with `tokio::fs::write`
- [x] T020 [P] [US2] Migrate `list_directory` to async FS in `tendril-ui/src-tauri/src/lib.rs` — replace `fs::read_dir`, `entry.metadata()` with `tokio::fs::read_dir` and async metadata
- [x] T021 [P] [US2] Migrate `read_capabilities` to async FS in `tendril-ui/src-tauri/src/lib.rs` — replace `fs::read_to_string` with `tokio::fs::read_to_string`
- [x] T022 [P] [US2] Migrate `read_tool_source` to async FS in `tendril-ui/src-tauri/src/lib.rs` — replace `fs::read_to_string` with `tokio::fs::read_to_string`
- [x] T023 [US2] Convert `executeDeno` to async FS in `tendril-agent/src/sandbox.ts` — replace `fs.writeFileSync`/`fs.existsSync`/`fs.unlinkSync` with `fs.promises.writeFile`/`fs.promises.access`/`fs.promises.unlink`
- [x] T024 [US2] Replace `tokio::time::sleep(500ms)` with protocol response wait in `tendril-ui/src-tauri/src/acp.rs` — use a oneshot channel or shared state to wait for JSON-RPC response with `id: "init-1"`, add a timeout (5s) for the wait
- [x] T025 [US2] Propagate settings save errors to UI — change `onSave` prop type in `tendril-ui/src/components/SettingsPanel.tsx` from `(config: Partial<AppConfig>) => void` to `(config: Partial<AppConfig>) => Promise<void>`, add try/catch in `handleSaveConfig` in `tendril-ui/src/App.tsx` to display errors, add error state and display in SettingsPanel

**Checkpoint**: `grep -rn 'std::fs' tendril-ui/src-tauri/src/lib.rs` returns zero hits in async command bodies. `grep -rn 'readFileSync\|writeFileSync' tendril-agent/src/` returns zero results. UI responsive during large directory scans.

---

## Phase 5: User Story 3 — Agent Crash Recovery (Priority: P1)

**Goal**: Detect agent process termination, update UI connection status, auto-reconnect with backoff, fix listener cleanup races.

**Independent Test**: Kill agent sidecar while app is running. UI shows "disconnected" within 2s. Auto-reconnect fires and succeeds.

### Implementation for User Story 3

- [x] T026 [US3] Emit `connection-status` event on agent termination in `tendril-ui/src-tauri/src/acp.rs` — in `CommandEvent::Terminated` handler, emit `connection-status` event with `{ status: "disconnected", message, timestamp }`, clear agent state via managed state mutex
- [x] T027 [US3] Emit `connection-status` event on successful connection in `tendril-ui/src-tauri/src/acp.rs` — emit `{ status: "connected" }` after successful `connect_agent` initialization sequence
- [x] T028 [US3] Implement auto-reconnect logic in `tendril-ui/src-tauri/src/acp.rs` — after detecting termination, spawn a task that waits 2s then calls `connect_agent`, retry up to 3 times with 2s intervals, emit `{ status: "reconnecting" }` during retries, emit `{ status: "error" }` after 3 failures
- [x] T029 [US3] Listen for `connection-status` events in `tendril-ui/src/context/AgentContext.tsx` — add event listener for `connection-status`, update `connectionStatus` reducer state from event payload, handle all states: `connected`, `disconnected`, `reconnecting`, `error`
- [x] T030 [US3] Fix `useEffect` cleanup race in `tendril-ui/src/context/AgentContext.tsx` — implement `AbortController` pattern in `setup()`, check `signal.aborted` before each `await listen(...)`, store all `unlisten` functions in a ref, call all unlistens in cleanup function
- [x] T031 [US3] Implement app config caching in Tauri managed state in `tendril-ui/src-tauri/src/lib.rs` — add `AppConfigCache` struct to managed state, read from disk once in `setup` callback, update cache after `write_config`, change `configured_workspace()` to read from cache via `State<>` parameter

**Checkpoint**: Kill agent process → UI shows "disconnected" → auto-reconnect succeeds within 6s. No leaked listeners on component unmount.

---

## Phase 6: User Story 4 — Single Source of Truth (Priority: P2)

**Goal**: Eliminate all duplicated config, prompts, and validation between Rust backend and TypeScript agent.

**Independent Test**: Change system prompt or config default in one location, verify reflected everywhere.

### Implementation for User Story 4

- [x] T032 [US4] Write system prompt to shared file in `tendril-agent/src/prompt.ts` — add `writeSystemPrompt(workspacePath)` function that writes prompt text to `{workspace}/system-prompt.txt` using `fs.promises.writeFile`
- [x] T033 [US4] Call `writeSystemPrompt` on agent startup in `tendril-agent/src/index.ts` — invoke after config is loaded and workspace is known
- [x] T034 [US4] Replace hardcoded prompt in `tendril-ui/src-tauri/src/lib.rs` — change `get_system_prompt` command to read from `{workspace}/system-prompt.txt` via `tokio::fs::read_to_string`, remove the inline prompt string and `format!` template
- [x] T035 [US4] Remove Rust config defaults in `tendril-ui/src-tauri/src/lib.rs` — delete `DEFAULT_TIMEOUT_MS`, `DEFAULT_MAX_CAPABILITIES`, `DEFAULT_MAX_TURNS` constants and `default_app_config()` function, update `init_workspace` to write minimal config `{ "workspace": path }` (agent fills defaults)
- [x] T036 [US4] Implement zod config schema in `tendril-agent/src/config.ts` — define `WorkspaceConfigSchema` using zod with `.default()` for all fields, replace `as string ??` coercion chains with `schema.parse(raw)`, derive `WorkspaceConfig` type from schema
- [x] T037 [US4] Remove `readConfig()` call from execute tool in `tendril-agent/src/tools/execute.ts` — change `executeCode` factory to accept `config: WorkspaceConfig` parameter, pass sandbox config from closure instead of re-reading from disk
- [x] T038 [US4] Instantiate `CapabilityRegistry` as singleton in `tendril-agent/src/agent.ts` — create one instance, pass to tool factories: update `searchCapabilities`, `registerCapability`, `loadTool` to accept `registry: CapabilityRegistry` instead of `workspacePath: string`
- [x] T039 [P] [US4] Update tool factory signatures in `tendril-agent/src/tools/search.ts`, `tendril-agent/src/tools/register.ts`, `tendril-agent/src/tools/load.ts` — change parameter from `workspacePath: string` to `registry: CapabilityRegistry`, remove `new CapabilityRegistry()` from each callback
- [x] T040 [P] [US4] Add comment to Rust tool name validation in `tendril-ui/src-tauri/src/lib.rs` `read_tool_source` — document that the `^[a-z0-9_]+$` pattern must match `VALID_TOOL_NAME` in `tendril-agent/src/registry.ts`

**Checkpoint**: `grep -rn 'You are Tendril' tendril-ui/src-tauri/src/` returns zero results. `grep -rn 'DEFAULT_TIMEOUT_MS\|DEFAULT_MAX_CAPABILITIES\|DEFAULT_MAX_TURNS' tendril-ui/src-tauri/src/` returns zero results. `grep -rn 'new CapabilityRegistry' tendril-agent/src/tools/` returns zero results.

---

## Phase 7: User Story 6 — UI Resilience and Correctness (Priority: P2)

**Goal**: Add error boundary, fix settings sync, debounce file explorer, fix doc view staleness, add save confirmation.

**Independent Test**: Trigger rendering error → recovery UI shown. Modify config externally → settings update. Rapid-click files → no race. Switch to doc view with edits → shows current edits.

### Implementation for User Story 6

- [x] T041 [P] [US6] Add React error boundary in `tendril-ui/src/App.tsx` — create `ErrorBoundary` class component with `componentDidCatch`, render error message + "Reload" button, wrap `AppContent` inside `<ErrorBoundary>` within the `<AgentProvider>`
- [x] T042 [P] [US6] Fix settings panel sync in `tendril-ui/src/components/SettingsPanel.tsx` — add `useEffect` that updates form state when `config` prop changes (compare by value), or use `key={JSON.stringify(config)}` on the component for remount
- [x] T043 [US6] Add click debounce to file explorer in `tendril-ui/src/components/FileExplorer.tsx` — add `isLoading` state guard to `handleClick`, ignore new clicks while a read is in progress, optionally cancel previous read via `AbortController`
- [x] T044 [P] [US6] Fix markdown doc view to show edited content in `tendril-ui/src/components/FileExplorer.tsx` — change doc mode rendering from `selectedFile.content` to `editedContent` (the current in-memory edits)
- [x] T045 [US6] Add save confirmation dialog in `tendril-ui/src/components/FileExplorer.tsx` — use Tauri dialog plugin (`tauri-plugin-dialog`) `confirm()` before `write_file_content`, only proceed if user confirms

**Checkpoint**: Error boundary catches test throw. Settings reflect external changes. No overlapping reads on rapid clicks. Doc view shows unsaved edits.

---

## Phase 8: User Story 5 — Dead Code and Smell Removal (Priority: P3)

**Goal**: Remove all unused code, fix type-safety issues, eliminate module-level mutable state, simplify reducer logic.

**Independent Test**: `cargo check --workspace` with zero unused warnings for remediated items. No `_isChunkGroup` type assertions. No module-level `let` in React context.

### Implementation for User Story 5

- [x] T046 [P] [US5] Remove `uuid` crate from `tendril-ui/src-tauri/Cargo.toml` — delete the `uuid = { version = "1", features = ["v4"] }` line
- [x] T047 [P] [US5] Remove unused `_app` parameter from `send_prompt` in `tendril-ui/src-tauri/src/lib.rs` — change signature from `async fn send_prompt(text: String, _app: tauri::AppHandle)` to `async fn send_prompt(text: String)`, update `generate_handler!` if needed
- [x] T048 [P] [US5] Remove `write_to_agent` wrapper in `tendril-ui/src-tauri/src/acp.rs` — delete the `write_to_agent` function, update `send_prompt` and `send_cancel` to call `write_to_agent_logged` directly (pass app handle from managed state)
- [x] T049 [P] [US5] Remove unused `CapabilityRegistry.exists()` and `CapabilityRegistry.list()` methods from `tendril-agent/src/registry.ts`
- [x] T050 [P] [US5] Add `isChunkGroup` as optional field on `DebugEntry` interface in `tendril-ui/src/context/AgentContext.tsx` or `tendril-ui/src/types.ts` — replace all `as DebugEntry & { _isChunkGroup: boolean }` type assertions with proper field access
- [x] T051 [P] [US5] Move `msgCounter` to `useRef` inside `AgentProvider` in `tendril-ui/src/context/AgentContext.tsx` — replace module-level `let msgCounter = 0` with `const msgCounterRef = useRef(0)` inside the provider component, update `nextMsgId` to use the ref
- [x] T052 [P] [US5] Refactor `lastToolCallId` in `tendril-agent/src/index.ts` — move from module-level `let lastToolCallId` to a local variable scoped within `onPrompt`, or track per-event from the actual `toolUseId` in each event handler
- [x] T053 [US5] Replace `deepMerge` with typed config merge in `tendril-ui/src/App.tsx` — replace the generic `Record<string, unknown>` deep merge with a typed field-level merge for `AppConfig`, preserving type safety
- [x] T054 [US5] Simplify `APPEND_TEXT` reducer case in `tendril-ui/src/context/AgentContext.tsx` — document the state machine clearly, simplify the three-branch logic for post-tool-call text streaming, add comments explaining when each branch triggers
- [x] T055 [P] [US5] Remove redundant `refreshCaps` call on capabilities tab click in `tendril-ui/src/App.tsx` — remove the `if (tab.id === 'capabilities') refreshCaps()` in the tab click handler since `CapabilityBrowser` already loads on mount via `useEffect`

**Checkpoint**: `cargo check --workspace` clean. No `readFileSync`/`writeFileSync` in agent. No module-level `let` in React context. No type assertion escape hatches for `_isChunkGroup`.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all stories.

- [x] T056 Run `cargo check --workspace` and fix any remaining warnings in `tendril-ui/src-tauri/`
- [x] T057 Run `npm run build` in `tendril-agent/` and fix any TypeScript errors
- [x] T058 Run verification commands from `specs/003-code-review-remediation/quickstart.md` — confirm all grep checks pass
- [x] T059 [P] Update `CHANGELOG.md` with all remediation changes under appropriate version section

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1 Security)**: Depends on Phase 2 (async helpers, managed state)
- **Phase 4 (US2 Async)**: Depends on Phase 2 (async helpers already in place)
- **Phase 5 (US3 Crash Recovery)**: Depends on Phase 2 (managed state migration)
- **Phase 6 (US4 Deduplication)**: Depends on Phase 2 (async config), can start after Phase 4
- **Phase 7 (US6 UI/UX)**: Depends on Phase 2 only — can run in parallel with Phases 3–6
- **Phase 8 (US5 Dead Code)**: Depends on Phase 5 (managed state must be migrated before removing wrappers)
- **Phase 9 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1 (Security, P0)**: After Foundational. No dependency on other stories.
- **US2 (Async, P1)**: After Foundational. No dependency on other stories. Can parallel with US1.
- **US3 (Crash Recovery, P1)**: After Foundational. No dependency on other stories. Can parallel with US1/US2.
- **US4 (Deduplication, P2)**: After Foundational + US2 (async config must be done). Depends on T007/T008 from foundational.
- **US6 (UI/UX, P2)**: After Foundational. No dependency on other stories. Can parallel with US1–US4.
- **US5 (Dead Code, P3)**: After US3 (managed state migration in T005 must be complete for T048). Can parallel with US4/US6.

### Within Each User Story

- Tasks marked `[P]` within a story can run in parallel
- Sequential tasks within a story depend on prior tasks in that story
- Each story's checkpoint must pass before marking story complete

### Parallel Opportunities

**After Foundational completes, these can run simultaneously:**
- US1 (Rust security fixes) + US2 (remaining async migration) + US3 (crash recovery) + US6 (UI fixes)
- Within US5: T046, T047, T049, T050, T051, T052, T055 are all independent file edits

---

## Parallel Example: User Story 1 (Security)

```
# These touch different functions/files and can run in parallel:
T010: Harden reveal_in_file_explorer (lib.rs:196-228)
T011: Update window.open override (main.tsx)
T016: Secure sandbox temp files (sandbox.ts)

# These are sequential (same function area in lib.rs):
T012: list_directory validation → T013: read_capabilities validation → T014: write_config validation → T015: init_workspace validation → T017: init_workspace async
```

## Parallel Example: User Story 5 (Dead Code)

```
# All independent file edits — can all run in parallel:
T046: Remove uuid (Cargo.toml)
T047: Remove _app param (lib.rs)
T049: Remove unused registry methods (registry.ts)
T050: Fix _isChunkGroup typing (AgentContext.tsx / types.ts)
T051: Move msgCounter to useRef (AgentContext.tsx)
T052: Refactor lastToolCallId (index.ts)
T055: Remove redundant refreshCaps (App.tsx)
```

---

## Implementation Strategy

### MVP First (User Story 1 — Security Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T009)
3. Complete Phase 3: US1 Security (T010–T017)
4. **STOP and VALIDATE**: All security acceptance scenarios pass
5. This alone addresses the P0 critical vulnerabilities

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. US1 (Security) → P0 vulnerabilities closed ← **MVP**
3. US2 (Async) + US3 (Crash Recovery) → P1 reliability issues resolved
4. US4 (Deduplication) + US6 (UI/UX) → P2 quality and UX improvements
5. US5 (Dead Code) → P3 cleanup
6. Polish → Verified and documented

### Total Task Count: 59

| Phase | Story | Tasks | Parallel |
|-------|-------|-------|----------|
| Setup | — | 1 | — |
| Foundational | — | 8 | — |
| US1 Security | P0 | 8 | T010+T011+T016 |
| US2 Async | P1 | 8 | T019+T020+T021+T022 |
| US3 Crash Recovery | P1 | 6 | — |
| US4 Deduplication | P2 | 9 | T039+T040 |
| US6 UI/UX | P2 | 5 | T041+T042+T044 |
| US5 Dead Code | P3 | 10 | T046+T047+T048+T049+T050+T051+T052+T055 |
| Polish | — | 4 | T059 |
