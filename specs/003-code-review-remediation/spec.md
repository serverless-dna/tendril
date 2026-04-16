# Feature Specification: Code Review Remediation

**Feature Branch**: `code-review`  
**Created**: 2026-04-15  
**Status**: Draft  
**Input**: User description: "Remediate all findings from comprehensive code review covering security vulnerabilities, async/sync violations, dead code, duplicated code, code smells, UI/UX design issues, and robustness/reliability gaps across the tendril-ui (Tauri + React) and tendril-agent (Node.js sidecar) codebases."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure Command Execution (Priority: P0)

A user interacts with the Tendril desktop app: clicking links in assistant responses, browsing files, and managing capabilities. The system must prevent any untrusted input from executing arbitrary commands on the host operating system, reading files outside the workspace, or writing configuration that could be exploited.

**Why this priority**: Security vulnerabilities are the highest-impact issues. The `reveal_in_file_explorer` command injection vector (via `open`/`explorer`) combined with the `window.open` override means any link rendered in the webview could execute arbitrary commands on macOS. Missing workspace validation on `list_directory` and `read_capabilities` allows information disclosure. These must be fixed before any other work.

**Independent Test**: Can be tested by attempting to open malicious URLs (e.g., `file:///Applications/Calculator.app`, shell metacharacters), listing directories outside the workspace, reading capabilities from arbitrary paths, and writing crafted config payloads. All attempts must be rejected with appropriate errors.

**Acceptance Scenarios**:

1. **Given** the app is running, **When** a `window.open()` call is triggered with a URL that is not a valid `https://` URL, **Then** the system rejects the request and does not pass the URL to the OS `open` command.
2. **Given** the app is running, **When** `reveal_in_file_explorer` is called with a filesystem path, **Then** the system validates the path is within the workspace and uses `open --reveal` (macOS) to show in Finder without executing.
3. **Given** the app is running, **When** `list_directory` is called with a path outside the workspace, **Then** the system returns an error and does not enumerate the directory.
4. **Given** the app is running, **When** `read_capabilities` is called with a path outside the workspace, **Then** the system returns an error and does not read the file.
5. **Given** the app is running, **When** `write_config` is called, **Then** the system validates the JSON payload against a known schema before writing.
6. **Given** the app is running, **When** `init_workspace` is called with a dangerous path (e.g., `/`, `/etc`), **Then** the system rejects the request.
7. **Given** the agent sandbox creates a temp file, **When** the filename is generated, **Then** it uses a cryptographically random name and writes to the OS temp directory, not the workspace.

---

### User Story 2 - Non-Blocking Async Operations (Priority: P1)

A user sends prompts, browses files, and uses tools in the Tendril app. All operations must complete without freezing the UI or blocking the Node.js event loop in the agent sidecar. The user must never experience the app becoming unresponsive during file operations or agent communication.

**Why this priority**: Synchronous file I/O in async Rust commands blocks the tokio runtime, and synchronous I/O in the agent blocks the Node.js event loop. Both cause UI freezes and degraded responsiveness — the second most impactful class of issues after security.

**Independent Test**: Can be tested by performing file operations on large directories, sending concurrent prompts, and monitoring UI responsiveness and event loop latency. The UI must remain interactive during all operations.

**Acceptance Scenarios**:

1. **Given** the app is running, **When** any Tauri async command performs file I/O, **Then** it uses `tokio::fs` or `tokio::task::spawn_blocking` — never synchronous `std::fs` in an async context.
2. **Given** the agent is running, **When** any registry, sandbox, or config operation performs file I/O, **Then** it uses `fs.promises` (async) — never `fs.readFileSync` or `fs.writeFileSync`.
3. **Given** the app sends `initialize` to the agent, **When** waiting for the response, **Then** the system waits for the actual JSON-RPC response with matching `id` — not a fixed `sleep(500ms)`.
4. **Given** the user saves settings, **When** `handleSaveConfig` completes or fails, **Then** errors propagate to the UI and are displayed to the user — not silently swallowed.

---

### User Story 3 - Agent Crash Recovery (Priority: P1)

A user is working in the Tendril app when the agent sidecar process crashes or terminates unexpectedly. The app must detect the failure, update the connection status in the UI, and either automatically reconnect or provide a clear mechanism for the user to reconnect.

**Why this priority**: Without reconnection logic, the app becomes permanently non-functional after an agent crash. The user sees "connected" but all operations fail silently. This is a critical reliability gap tied directly to the async/event-driven architecture.

**Independent Test**: Can be tested by killing the agent sidecar process while the app is running and verifying the UI updates to show "disconnected" and the app attempts reconnection or offers a reconnect action.

**Acceptance Scenarios**:

1. **Given** the agent process terminates unexpectedly, **When** the Tauri backend detects the termination, **Then** the connection status is set to `disconnected` and the UI reflects this state.
2. **Given** the agent is disconnected, **When** the user triggers a reconnect (or auto-reconnect fires), **Then** a new agent process is spawned and the protocol initialization sequence runs.
3. **Given** the agent disconnects during setup, **When** listeners were partially registered, **Then** all listeners are properly cleaned up to prevent resource leaks.

---

### User Story 4 - Single Source of Truth for Config and Prompts (Priority: P2)

A developer maintains the Tendril codebase. Configuration defaults, config parsing logic, tool name validation, and the system prompt must each be defined in exactly one place. Changes to any of these must not require updates in multiple files across the Rust and TypeScript codebases.

**Why this priority**: Duplicated code across the Rust backend and TypeScript agent is a maintenance burden that leads to drift and inconsistency. The system prompt is already hardcoded in two places with different escaping. Config defaults are defined independently in both codebases. This is the highest-impact code quality improvement.

**Independent Test**: Can be tested by changing a default config value or the system prompt in one location and verifying the change is reflected everywhere it is consumed, without modifying any other file.

**Acceptance Scenarios**:

1. **Given** the system prompt text is defined, **When** the agent or the settings UI needs the prompt, **Then** both read from a single authoritative source (e.g., a shared file loaded at startup).
2. **Given** config defaults are defined, **When** the Rust backend or TypeScript agent needs a default value, **Then** the agent is the single owner of defaults and the Rust backend defers to the agent or reads from a shared config file.
3. **Given** tool name validation rules exist, **When** either the Rust backend or TypeScript agent validates a tool name, **Then** both use the same regex pattern from a single definition.
4. **Given** the agent reads config, **When** `execute()` is invoked, **Then** it uses the config already loaded at startup — not a fresh read from disk.

---

### User Story 5 - Dead Code and Smell Removal (Priority: P3)

A developer reviews the codebase and finds no unused dependencies, unused parameters, redundant wrapper functions, or type-unsafe escape hatches. The codebase is clean, testable, and follows established patterns.

**Why this priority**: Dead code and code smells add noise, reduce testability, and create confusion. While lower impact than security or async issues, cleaning these up improves maintainability and reduces onboarding friction.

**Independent Test**: Can be tested by running `cargo check --workspace` with no unused warnings, verifying no unused npm dependencies, and confirming all public methods are called at least once.

**Acceptance Scenarios**:

1. **Given** the Rust codebase, **When** compiled, **Then** the `uuid` crate is not in `Cargo.toml` and the `_app` parameter in `send_prompt` is either used or removed.
2. **Given** the agent codebase, **When** reviewed, **Then** `CapabilityRegistry.exists()` and `CapabilityRegistry.list()` are either used or removed.
3. **Given** the `write_to_agent` wrapper, **When** the code is reviewed, **Then** the wrapper is removed and callers use the logged variant directly.
4. **Given** the agent process state, **When** the Rust backend manages it, **Then** it uses Tauri managed state (`app.manage()`) — not a global `OnceLock<Mutex<Option<...>>>`.
5. **Given** debug log entries, **When** `_isChunkGroup` is needed, **Then** it is a proper optional field on `DebugEntry` — not a type assertion escape hatch.
6. **Given** the module-level `msgCounter`, **When** used in the AgentContext provider, **Then** it is a `useRef` inside the provider — not a module-level mutable variable.
7. **Given** `lastToolCallId` in the agent, **When** tracking tool calls, **Then** IDs are tracked per-event or from the actual event ID — not a module-level mutable variable.
8. **Given** the `deepMerge` function in App.tsx, **When** merging config, **Then** it uses typed field-level merging or a validated utility — not hand-rolled `Record<string, unknown>` type erasure.
9. **Given** config parsing in the agent, **When** raw config is parsed, **Then** it uses proper schema validation (e.g., zod) — not `as string` type coercion chains.

---

### User Story 6 - UI Resilience and Correctness (Priority: P2)

A user interacts with the Tendril app UI under various conditions: rendering crashes, external config changes, rapid clicks, and switching between editor views. The app must handle all these gracefully without white-screening, showing stale data, or producing race conditions.

**Why this priority**: UI issues degrade the user experience and trust. A white-screen crash with no recovery is unacceptable for a desktop app. Stale data and race conditions erode confidence in the tool.

**Independent Test**: Can be tested by triggering rendering errors, modifying config externally while settings are open, rapidly clicking files in the explorer, and switching between code and doc views with unsaved edits.

**Acceptance Scenarios**:

1. **Given** a rendering error occurs in any component, **When** the error is thrown, **Then** a React error boundary catches it and displays a recovery UI — not a white screen.
2. **Given** the settings panel is open and config is changed externally, **When** the config file changes, **Then** the settings form reflects the updated values.
3. **Given** the file explorer is showing a file, **When** the user clicks rapidly on different files, **Then** only the last-clicked file's content is displayed — earlier requests are cancelled or ignored.
4. **Given** the file editor has unsaved changes, **When** the user switches to markdown doc view, **Then** the doc view shows the current edited content — not the last-saved version.
5. **Given** the user clicks Save in the file editor, **When** a confirmation dialog is presented, **Then** the file is only written after explicit confirmation.

---

### Edge Cases

- What happens when `reveal_in_file_explorer` receives a symlink that points outside the workspace? The resolved (canonical) path must be validated against the workspace boundary.
- How does the system handle a `write_config` payload that passes schema validation but contains path traversal in string values (e.g., `../../etc/passwd` as a workspace path)? Path values in config must be canonicalized and validated.
- What happens if the agent sidecar crashes during the `initialize` protocol sequence? The backend must handle partial initialization and clean up.
- What happens if `list_directory` is called with a path containing symlinks that resolve outside the workspace? The resolved path must be checked.
- How does the system handle concurrent `save` and `read` operations on the same file in the file explorer? Operations must be serialized or the later read must reflect the save.

## Requirements *(mandatory)*

### Functional Requirements

#### Security

- **FR-001**: System MUST validate all paths passed to `reveal_in_file_explorer` against the workspace boundary using `validate_within_workspace()` before passing to OS commands.
- **FR-002**: System MUST distinguish between URL opening (valid `https://` URLs only, opened in default browser) and file revealing (workspace-validated paths, revealed via `open --reveal` / explorer equivalent).
- **FR-003**: System MUST call `validate_within_workspace()` in `list_directory` before enumerating directory contents.
- **FR-004**: System MUST call `validate_within_workspace()` in `read_capabilities` before reading tool index files.
- **FR-005**: System MUST validate `write_config` payloads against a defined JSON schema before writing to disk.
- **FR-006**: System MUST validate `init_workspace` paths to reject dangerous targets (filesystem root, system directories).
- **FR-007**: System MUST use cryptographically random filenames for sandbox temp files and write them to the OS temp directory.

#### Async / Non-Blocking

- **FR-008**: All Tauri `async fn` commands MUST use `tokio::fs` or `tokio::task::spawn_blocking` for file I/O — never synchronous `std::fs`.
- **FR-009**: All agent file operations (registry, sandbox, config) MUST use `fs.promises` — never synchronous `fs` variants.
- **FR-010**: `connect_agent` MUST wait for the actual JSON-RPC `initialize` response (matching `id`) instead of a fixed `sleep(500ms)`.
- **FR-011**: Error results from `handleSaveConfig` MUST propagate to the UI and be displayed to the user.

#### Robustness / Reliability

- **FR-012**: System MUST detect agent process termination and set connection status to `disconnected`, updating the UI.
- **FR-013**: System MUST provide automatic reconnection or a user-triggered reconnect mechanism after agent crash.
- **FR-014**: `useEffect` cleanup in `AgentContext` MUST prevent listener registration after component unmount.
- **FR-015**: System MUST cache the app config in Tauri managed state, reading from disk only on startup or explicit refresh — not on every command invocation.

#### Code Quality — Deduplication

- **FR-016**: System prompt text MUST be defined in exactly one authoritative location, consumed by both the agent and the settings UI.
- **FR-017**: Config defaults MUST be defined in one location, with the agent as the single owner.
- **FR-018**: Tool name validation regex MUST be defined once and shared between the Rust backend and the TypeScript agent.
- **FR-019**: `readConfig()` MUST NOT be called on every tool execution; the config loaded at startup MUST be reused.
- **FR-020**: `CapabilityRegistry` MUST be instantiated once per session and shared across tool callbacks — not recreated on every invocation.

#### Code Quality — Dead Code & Smells

- **FR-021**: Unused `uuid` crate MUST be removed from `Cargo.toml`.
- **FR-022**: Unused `_app` parameter in `send_prompt` MUST be removed or utilized.
- **FR-023**: `write_to_agent` wrapper MUST be removed; callers MUST use `write_to_agent_logged` directly.
- **FR-024**: Unused `CapabilityRegistry.exists()` and `CapabilityRegistry.list()` MUST be removed or utilized.
- **FR-025**: Agent process state MUST use Tauri managed state — not global `OnceLock<Mutex<Option<...>>>`.
- **FR-026**: `_isChunkGroup` MUST be a proper optional field on `DebugEntry`.
- **FR-027**: `msgCounter` MUST be a `useRef` inside the provider — not a module-level variable.
- **FR-028**: `lastToolCallId` MUST be tracked per-event or from the actual event ID — not a module-level variable.
- **FR-029**: `deepMerge` MUST be replaced with typed field-level merging or a validated utility.
- **FR-030**: Config parsing MUST use schema validation (e.g., zod) — not type assertion chains.

#### UI / UX

- **FR-031**: App MUST have a React error boundary at the top level that catches rendering errors and displays a recovery UI.
- **FR-032**: Settings panel MUST sync with external config changes (via `useEffect` or key-based remount).
- **FR-033**: File explorer clicks MUST be debounced or guarded to prevent overlapping async reads.
- **FR-034**: Markdown doc view MUST render `editedContent` — not the last-saved `selectedFile.content`.
- **FR-035**: File save MUST require user confirmation before overwriting.

### Key Entities

- **AppConfig**: Application configuration object covering model settings, timeouts, workspace path, sandbox settings. Single source of truth: `~/.tendril/config.json`, parsed and cached in memory.
- **AgentProcess**: Represents the running agent sidecar process, its stdin/stdout handles, and connection status. Lifecycle managed by the Tauri backend.
- **CapabilityRegistry**: Index of registered tools/capabilities in the workspace. Singleton per session, backed by `{workspace}/tools/index.json`.
- **DebugEntry**: Structured log entry emitted by the agent context for debugging. Includes optional `isChunkGroup` boolean field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero paths passed to OS `open`/`explorer`/`xdg-open` commands without prior workspace or URL validation — verifiable by code audit and automated test.
- **SC-002**: Zero synchronous `std::fs` calls in any `async fn` Tauri command — verifiable by `grep` for `std::fs::` in async command bodies.
- **SC-003**: Zero synchronous `fs.readFileSync` or `fs.writeFileSync` calls in the agent codebase — verifiable by `grep`.
- **SC-004**: The UI remains responsive (no frame drops > 100ms) when `list_directory` scans a directory with 10,000+ entries.
- **SC-005**: Agent crash is detected and the UI updates to "disconnected" within 2 seconds of process termination.
- **SC-006**: System prompt is defined in exactly 1 file — verifiable by `grep` showing a single definition location.
- **SC-007**: Config defaults are defined in exactly 1 location — verifiable by `grep`.
- **SC-008**: All React component trees are wrapped by an error boundary — verifiable by rendering a component that throws and confirming recovery UI appears.
- **SC-009**: `cargo check --workspace` produces zero unused-import or unused-variable warnings related to the remediated items.
- **SC-010**: All `CapabilityRegistry` usages share a single instance per session — verifiable by searching for `new CapabilityRegistry` and confirming it appears in exactly one initialization path.

## Assumptions

- The existing workspace validation function `validate_within_workspace()` in `lib.rs` is correct and can be reused for the commands that currently lack it.
- The `zod` library is already a dependency of the agent (or can be added without controversy) for config schema validation.
- The system prompt can be stored as a text file in the workspace or agent bundle and loaded at startup by both the agent and the Rust backend (via the agent reporting it).
- Agent auto-reconnection is preferred over requiring manual user action, but either approach satisfies the requirement.
- Removing `CapabilityRegistry.exists()` and `CapabilityRegistry.list()` is acceptable if no planned feature requires them; if a near-term feature needs them, they should be retained and documented.
- The `chatDraft` state lifting (Issue 6.2) is explicitly out of scope — the current approach is functional and the review noted the existing rationale is valid.
- Capabilities loading redundancy (Issue 6.4) is addressed by removing the redundant `refreshCaps` call in the tab click handler, keeping the component's `useEffect` load.
- The `APPEND_TEXT` reducer complexity (Issue 5.4) will be simplified as part of the code smells remediation, but the exact refactoring approach is left to the implementation plan.
