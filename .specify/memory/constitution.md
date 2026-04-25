<!--
  Sync Impact Report
  ==================
  Version change: 2.0.1 → 2.1.0 (MINOR: multi-provider support)
  Modified principles:
    - VII. Simplicity: "single provider" constraint relaxed to permit multi-provider via discriminated config
  Modified sections:
    - Technology Stack Constraints: Inference provider row expanded from Bedrock-only to 4 providers
    - Technology Stack Constraints: Added Tauri Stronghold row for secure credential storage
  Templates requiring updates:
    - .specify/templates/plan-template.md — ✅ compatible
    - .specify/templates/spec-template.md — ✅ compatible
    - .specify/templates/tasks-template.md — ✅ compatible
  Follow-up TODOs: None
-->

# Tendril Constitution

## Core Principles

### I. Async-First, Non-Blocking

All communication between the Tauri host, the Rust backend, and the
tendril-agent subprocess MUST be asynchronous. The main thread MUST
remain responsive at all times. No synchronous IPC, no blocking awaits
on the main thread, no synchronous Tauri commands that perform I/O or
subprocess communication.

- Tauri commands that interact with the agent MUST use async Rust
  handlers returning via Tauri's async command pattern.
- The tendril-agent runs as a separate bundled executable, communicated
  exclusively via NDJSON over stdin/stdout. Reading from and writing to
  the agent process MUST occur on dedicated async tasks, never the main
  thread.
- Long-running operations (Bedrock inference, Deno sandbox execution)
  MUST NOT block any Tauri or tokio worker thread. Use spawned tasks
  with cancellation support.

### II. Event-Driven State

The Tauri backend MUST push state changes to the React frontend via
Tauri event emissions. The frontend MUST NOT poll the backend for
updates. React components MUST derive their visual state from React
state/context updated by Tauri event listeners.

- Agent stream events (text chunks, tool calls, lifecycle changes)
  MUST be forwarded as Tauri events to the frontend as they arrive.
- The frontend registers event listeners on mount and updates React
  state in response. UI re-renders are driven solely by state changes.
- Synchronous Tauri `invoke` calls are permitted ONLY for
  request-response operations that complete in under 50ms (e.g.,
  reading a config value from memory). All other interactions MUST
  use the event channel.

### III. Component Isolation

React UI components MUST be reusable, state-driven, and minimally
coupled. Components MUST NOT directly call Tauri APIs or manage IPC
concerns. A thin adapter layer (hooks or context providers) bridges
Tauri events into React state.

- Components receive data via props or shared context, never by
  importing Tauri bindings directly.
- Side effects (event subscriptions, command invocations) are
  encapsulated in custom hooks, not embedded in component bodies.
- Components MUST be independently renderable with mock state for
  testing and development (e.g., Storybook or equivalent).

### IV. Protocol Compliance

The ACP integration between the Tauri host and tendril-agent MUST
comply with the Agent Integrator Specification v1.0.0. Protocol
violations are bugs, not features.

- The full protocol sequence (initialize, new_session, prompt cycle,
  cancel, shutdown) MUST be implemented without shortcuts or
  proprietary extensions. Methods explicitly marked as deferred in
  the feature specification are exempt until their implementation
  increment.
- Turn-end event ordering MUST be enforced:
  message_usage, query_result, prompt_complete.
- The agent MUST respond to `prompt` immediately with an empty result;
  all processing happens via async stream events.
- Permission flow MUST block the agent until the host responds; the
  host MUST present the permission request to the user and relay the
  decision.

### V. Sandboxed Execution

The tendril-agent and its Deno sandbox MUST enforce strict execution
boundaries. Code execution is confined to the workspace directory.
Network access is limited to approved domains.

- Deno subprocess permissions MUST be scoped: `--allow-read` and
  `--allow-write` to workspace only, `--allow-net` to approved
  domains only, `--no-prompt`.
- Tool implementations MUST NOT access the filesystem outside the
  workspace or spawn child processes.
- Execution MUST be time-bounded. A timeout kills the Deno process
  and returns an error to the agentic loop.

### VI. Test-First

Tests MUST be written before implementation for the Tauri Rust shell,
the TypeScript agent, and React components.

- Tauri Rust: `cargo test` MUST pass before any PR merge. The Tauri
  backend (ACP host, event forwarding) MUST have unit tests.
- TypeScript agent: `vitest` (or equivalent) MUST pass. The ACP
  protocol layer, registry, and sandbox modules MUST have unit tests.
- Integration tests MUST cover the ACP protocol sequence end-to-end
  (host sends initialize through prompt_complete).
- React: Component tests MUST verify rendering against state
  changes, not implementation details.
- Red-Green-Refactor: write the test, confirm it fails, implement,
  confirm it passes, refactor.

### VII. Simplicity

Start with the simplest implementation that satisfies the requirement.
Do not add abstractions, configuration options, or extension points
unless a concrete and immediate need exists.

- YAGNI: no speculative features, no premature generalisation.
- Four bootstrap tools only: listCapabilities, registerCapability,
  loadTool, execute. Additional hardcoded tools are a constitution
  violation until explicitly amended.
- Single workspace, single user. Multi-provider inference is permitted
  via a discriminated config pattern (provider selector + per-provider
  config blocks). Other multi-anything remains out of scope.
- Prefer explicit code over clever abstractions. Three similar
  functions are better than one generic function with three modes.

## Technology Stack Constraints

| Layer | Technology | Constraint |
| ----- | ---------- | ---------- |
| Desktop shell | Tauri 2.x (Rust) | MUST use async commands exclusively for agent IPC |
| Frontend | React 18+ | MUST use functional components with hooks |
| Styling | TailwindCSS v4 | MUST be the sole styling system; no CSS-in-JS or CSS modules |
| Agent runtime | Node.js SEA (TypeScript) | MUST communicate via NDJSON/JSON-RPC 2.0 over stdio |
| Agent framework | @strands-agents/sdk | Strands SDK handles agentic loop and Bedrock provider |
| Inference provider | Bedrock, Ollama, OpenAI, Anthropic (via Strands SDK model classes) | Bedrock uses AWS credential chain; OpenAI/Anthropic keys in Stronghold vault; Ollama uses OpenAI-compat API |
| Credential storage | Tauri Stronghold (`tauri-plugin-stronghold`) | Encrypted vault for API keys; argon2 password hashing; keys injected as env vars at agent spawn |
| Code sandbox | Deno (bundled sidecar) | Permission flags as sandbox boundary; spawned via child_process |
| Agent bundler | esbuild + Node SEA | Single CJS bundle injected into Node binary |

Additions to this table require a MINOR constitution amendment.

## Development Workflow

- **Build order**: tendril-agent (TypeScript), then tendril-ui
  (Tauri + React). The agent MUST build and pass tests before
  integration with the Tauri shell.
- **Feature branches**: One branch per feature spec. Branch name
  matches spec directory prefix (e.g., `001-tendril-tauri-app`).
- **Commit discipline**: Commit after each logical unit of work.
  Each commit message MUST describe what changed and why.
- **No dead code**: Unused code MUST be removed, not commented out.
  Git history is the archive.
- **Error handling**: Tauri Rust backend uses `thiserror` for error
  types. TypeScript agent uses typed Error subclasses with context.
  Errors MUST propagate with context, never silently swallowed.
- **Logging**: Tauri Rust backend uses `tracing` crate. TypeScript
  agent writes diagnostic output to stderr. Protocol messages go
  to stdout exclusively.

## Governance

This constitution is the highest-authority document for the Tendril
project. All implementation decisions, code reviews, and spec
validations MUST verify compliance with these principles.

- **Amendments** require: (1) a written proposal documenting the
  change and rationale, (2) an updated constitution version, and
  (3) a sync impact review of all dependent templates and specs.
- **Version policy**: MAJOR for principle removal or incompatible
  redefinition, MINOR for new principles or material expansion,
  PATCH for clarifications and wording fixes.
- **Complexity justification**: Any deviation from Principle VII
  (Simplicity) MUST be documented in the implementation plan's
  Complexity Tracking table with the rejected simpler alternative.
- **Compliance review**: Every plan and task list MUST include a
  Constitution Check section confirming alignment with these
  principles before implementation begins.

**Version**: 2.1.0 | **Ratified**: 2026-04-11 | **Last Amended**: 2026-04-16
