# Research: Code Review Remediation

**Feature**: 003-code-review-remediation  
**Date**: 2026-04-15

## R1: Path Validation Strategy for `reveal_in_file_explorer`

**Decision**: Split `reveal_in_file_explorer` into two distinct code paths: URL opening (HTTPS only, validated via URL parsing) and file revealing (workspace-validated, using `open --reveal` on macOS). Reject all other schemes.

**Rationale**: The current implementation passes any string to the OS `open` command. On macOS, `open` can launch applications, run AppleScript, and execute arbitrary binaries. The `window.open` override in `main.tsx` routes all URLs through this path, making it a high-severity attack surface. Splitting by intent (URL vs file) and using `--reveal` for files prevents execution while still providing the expected UX.

**Alternatives considered**:
- Allowlist of file extensions: Too fragile, doesn't prevent execution of `.app` bundles
- Remove `reveal_in_file_explorer` entirely: Breaks useful UX functionality
- Use Tauri's built-in shell plugin `open`: Still executes via OS `open` command without `--reveal`

## R2: Async File I/O Migration in Tauri Commands

**Decision**: Replace all `std::fs` calls in `async fn` Tauri commands with `tokio::fs` equivalents. For operations that are trivially fast (e.g., reading a small config file from cache), use `tokio::fs` anyway for consistency — the overhead is negligible.

**Rationale**: Tauri dispatches `async fn` commands onto the tokio runtime. Synchronous `std::fs` calls block the tokio worker thread, which can cause UI freezes when scanning large directories or performing multiple concurrent file operations. `tokio::fs` delegates to a blocking thread pool, keeping the async executor free.

**Alternatives considered**:
- `tokio::task::spawn_blocking` wrapping sync code: More verbose, same effect. `tokio::fs` is preferred for readability when the operations are straightforward file I/O.
- Leave as-is with a comment: Unacceptable — blocks tokio runtime under load.

## R3: Async File I/O Migration in Agent Sidecar

**Decision**: Replace all `fs.readFileSync`/`fs.writeFileSync`/`fs.existsSync` calls in the agent with `fs.promises` equivalents. The tool callbacks in Strands SDK are already `async`-capable.

**Rationale**: The agent is a Node.js process handling a JSON-RPC protocol loop on stdin. Synchronous FS calls block the event loop during tool execution, preventing concurrent protocol message processing. While the agent is currently single-session, blocking during `executeDeno` calls where the registry might be queried is still problematic.

**Alternatives considered**:
- Worker threads for registry operations: Over-engineered for the current single-session model. Async FS is sufficient.
- Leave `existsSync` calls: `fs.existsSync` is acceptable for quick checks, but for consistency and to prevent blocking on slow filesystems (NFS, etc.), convert all calls.

## R4: Agent Process State Management

**Decision**: Migrate from global `OnceLock<Mutex<Option<AgentProcess>>>` to Tauri managed state via `app.manage()`. The `AgentProcess` struct becomes Tauri state accessed via `State<'_, Mutex<Option<AgentProcess>>>` in command handlers.

**Rationale**: Global mutable state makes testing impossible and couples all commands to a singleton. Tauri's managed state is designed for exactly this pattern — per-app state accessible from command handlers via dependency injection.

**Alternatives considered**:
- Keep `OnceLock` but add test helpers: Still untestable in parallel tests, still global.
- Use `Arc<Mutex<>>` passed through closures: Reinvents Tauri managed state.

## R5: System Prompt Single Source of Truth

**Decision**: The agent's `prompt.ts` is the single authoritative source for the system prompt. The Rust backend's `get_system_prompt` command is removed. The frontend retrieves the system prompt from the agent via a new ACP method (`get_config` or `get_system_prompt`) or the Rust backend reads the prompt from a shared file.

**Rationale**: The system prompt is only used by the agent at runtime. The Rust backend only needs it for display in the Settings panel. Having two copies with different escaping (`{{{{ }}}}` vs `{ }`) guarantees drift. The simplest approach: the Rust backend reads a static `.tendril/system-prompt.txt` file written by the agent on startup, or the frontend queries the agent directly.

**Decision (refined)**: Store the system prompt as a plain text file at `{workspace}/system-prompt.txt`, written by the agent on startup. The Rust `get_system_prompt` command reads this file. The agent's `TENDRIL_SYSTEM_PROMPT` function reads it too (or writes it if missing). This avoids adding a new ACP method, keeps both sides reading from one file.

**Alternatives considered**:
- New ACP method: Adds protocol complexity for a read-only value. Violates Principle VII (Simplicity).
- Hardcode in Rust, agent reads via stdin: Reverses the ownership — the agent is the prompt consumer, so it should own the content.
- Embed in config.json: Mixes runtime prompt with user config. The prompt is not user-configurable.

## R6: Config Deduplication Strategy

**Decision**: The agent owns all config defaults. The Rust backend reads `~/.tendril/config.json` as an untyped `Value` and passes it to the frontend as-is. The Rust backend does NOT maintain its own defaults or parsing logic beyond what it needs for workspace path resolution and validation. Remove `DEFAULT_TIMEOUT_MS`, `DEFAULT_MAX_CAPABILITIES`, `DEFAULT_MAX_TURNS` constants and `default_app_config()` from Rust.

**Rationale**: The Rust backend only needs the workspace path for path validation and the deno path for config writing during `connect_agent`. All other config values (model, sandbox, registry, agent settings) are consumed exclusively by the TypeScript agent. Maintaining parallel defaults guarantees drift.

**Alternatives considered**:
- Shared JSON schema file: Adds build complexity. The agent already validates via zod (once migrated).
- Rust reads defaults from agent binary: Complex IPC for a build-time concern.

## R7: Config Schema Validation with Zod

**Decision**: Replace the type-coercion chain in `config.ts` with a zod schema that defines the config structure, defaults, and validation. Zod is already a dependency (`^4.1.12` in `package.json`).

**Rationale**: The current `(raw.model as Record<string, unknown>)?.provider as string ?? DEFAULTS.model.provider` pattern is type-unsafe — `as string` assertions don't validate at runtime. Zod provides runtime validation with TypeScript type inference, handling defaults and coercion properly.

**Alternatives considered**:
- Manual validation with typeof checks: More verbose, less maintainable than zod.
- Keep `as` assertions but add runtime checks: Reinvents zod poorly.

## R8: Agent Crash Detection and Reconnection

**Decision**: When the agent process terminates (detected via `CommandEvent::Terminated`), the Tauri backend emits a `connection-status` event with status `disconnected`, clears the agent state, and attempts automatic reconnection after a 2-second delay. If reconnection fails 3 times, the UI shows a manual reconnect button.

**Rationale**: The current code emits an `agent-debug` event on termination but never updates the connection status, leaving the UI in a stale "connected" state. Auto-reconnection is preferred (per spec assumptions) with a fallback to manual action.

**Alternatives considered**:
- Manual reconnect only: Worse UX — user must notice the crash and click reconnect.
- Immediate reconnect with no backoff: Could cause rapid restart loops if the agent is crashing on startup.

## R9: `useEffect` Cleanup Race in AgentContext

**Decision**: Use an `AbortController` pattern in the `setup()` function. Pass the abort signal to async operations and check `signal.aborted` before registering listeners. Store listener unsubscribe functions and call them in the cleanup path.

**Rationale**: The current `cancelled` flag doesn't prevent the async `setup()` from completing after unmount. The `await listen(...)` calls inside will still register listeners that are never cleaned up. `AbortController` is the standard pattern for cancellable async initialization in React.

**Alternatives considered**:
- Track all `unlisten` functions in a ref and clean up: Works but doesn't prevent registration after unmount.
- Move setup to a synchronous path: Not possible — Tauri `listen()` is async.

## R10: App Config Caching in Tauri

**Decision**: Cache the parsed app config in Tauri managed state (`State<'_, Mutex<AppConfig>>`). Read from disk once at startup and on explicit refresh (after `write_config`). `configured_workspace()` and `validate_within_workspace()` read from the cache.

**Rationale**: Currently `read_app_config_inner()` reads from disk on every command. `read_file_content` and `write_file_content` each trigger two disk reads (workspace path + validation). Caching eliminates redundant I/O.

**Alternatives considered**:
- Lazy static with refresh: Global state — same problem as the agent process state.
- Read once, never refresh: Breaks when config is updated via `write_config`.

## R11: CapabilityRegistry Singleton

**Decision**: Instantiate `CapabilityRegistry` once when creating the agent and pass the instance to all tool callbacks via closure. The tool factory functions accept a registry reference instead of a workspace path.

**Rationale**: Currently each tool callback creates `new CapabilityRegistry(workspacePath)` on every invocation (4 instantiations per turn). While the object is lightweight, sharing a singleton is cleaner and enables future caching of the index.

**Alternatives considered**:
- Keep per-call instantiation: Works but wasteful and prevents index caching.
- Global singleton: Anti-pattern in Node.js; closures are idiomatic.

## R12: Tool Name Validation Deduplication

**Decision**: The agent's `VALID_TOOL_NAME` regex is the authoritative source. The Rust backend's inline char validation in `read_tool_source` is replaced with a regex constant that matches the agent's pattern. Both use `^[a-z0-9_]+$`.

**Rationale**: Having two implementations of the same validation guarantees they'll diverge. The regex is simple enough to duplicate as a constant, but both must reference the same pattern string.

**Alternatives considered**:
- Shared validation via ACP protocol: Over-engineered for a regex constant.
- Remove Rust-side validation: The Rust backend needs it for `read_tool_source` path construction security.

## R13: React Error Boundary

**Decision**: Add a top-level `ErrorBoundary` class component wrapping `AppContent` in `App.tsx`. Display a recovery UI with the error message and a "Reload" button that calls `window.location.reload()`.

**Rationale**: React error boundaries must be class components (no hook equivalent exists). A top-level boundary prevents white-screen crashes from any component rendering error. The recovery UI should be self-contained (no external dependencies) since the error may be in the styling or component system.

**Alternatives considered**:
- `react-error-boundary` library: Adds a dependency for a trivial class component. Violates Principle VII.
- Multiple granular boundaries: Over-engineered for the current component count. Start with one top-level boundary.

## R14: Temp File Security in Sandbox

**Decision**: Replace `Date.now()` with `crypto.randomUUID()` in the temp filename. Write to `os.tmpdir()` instead of the workspace directory. Ensure cleanup in the `finally` block.

**Rationale**: The current predictable filename (`.tendril-exec-{timestamp}.ts`) in the workspace directory is vulnerable to symlink race attacks on shared systems. Writing to the OS temp directory with a random name eliminates both issues.

**Alternatives considered**:
- Keep in workspace but randomize name: Still clutters the workspace if cleanup fails.
- Use Node.js `tmp` library: Adds a dependency. `os.tmpdir()` + `crypto.randomUUID()` is sufficient.
