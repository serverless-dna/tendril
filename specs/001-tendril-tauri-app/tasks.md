# Tasks: Tendril Tauri Application

**Input**: Design documents from `/specs/001-tendril-tauri-app/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths included in every task

## Phase 1: Setup

**Purpose**: Project initialization and monorepo structure

- [x] T001 Create monorepo root with `tendril-agent/` and `tendril-ui/` directories per plan.md project structure
- [x] T002 [P] Initialize `tendril-agent/` TypeScript project: `package.json` with `@strands-agents/sdk`, `zod`, `vitest` dependencies; `tsconfig.json` targeting Node 22; `vitest.config.ts` in `tendril-agent/`
- [x] T003 [P] Initialize `tendril-ui/` Tauri + React project: `cargo tauri init` in `tendril-ui/`, add `tauri-plugin-shell` to `tendril-ui/src-tauri/Cargo.toml`, configure `vite.config.ts` and `tailwind.config.ts` with TailwindCSS v4 in `tendril-ui/`
- [x] T004 [P] Configure `tendril-ui/src-tauri/tauri.conf.json`: set `bundle.externalBin` to `["binaries/tendril-agent", "binaries/deno"]`, configure app metadata
- [x] T005 [P] Create Tauri capability grants in `tendril-ui/src-tauri/capabilities/default.json`: grant `shell:allow-spawn` and `shell:allow-stdin-write` for both `tendril-agent` and `deno` sidecars
- [x] T006 [P] Create `tendril-agent/sea-config.json` for Node.js SEA build pipeline and add npm scripts for `build` (esbuild), `build:sea` (SEA inject), `test` (vitest) in `tendril-agent/package.json`
- [x] T007 [P] Create shared type definitions in `tendril-agent/src/types.ts`: `CapabilityDefinition`, `CapabilityRegistry` (index.json schema), `WorkspaceConfig` (config.json schema), `AcpRequest`, `AcpResponse`, `AcpNotification`, `StreamEvent` types

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can begin

### Tests (Red phase — write first, confirm they fail)

- [x] T008 [P] Write registry tests in `tendril-agent/tests/registry.test.ts`: test search (term matching, empty results), register (new + update existing), load (found + not found), list, exists; use temp directory fixtures
- [x] T009 [P] Write sandbox tests in `tendril-agent/tests/sandbox.test.ts`: test successful execution (stdout capture), timeout enforcement (process killed), permission scoping (reject paths outside workspace), temp file cleanup
- [x] T010 [P] Write protocol tests in `tendril-agent/tests/protocol.test.ts`: test initialize response format, new_session response + connected lifecycle event, prompt immediate ack, cancel → interrupted prompt_complete, stdin EOF detection, turn-end event ordering (message_usage → query_result → prompt_complete)
- [x] T011 [P] Write config tests in `tendril-agent/tests/config.test.ts`: test read valid config, defaults for missing fields, validation errors for missing required fields

### Implementation (Green phase)

- [x] T012 Implement workspace config reader in `tendril-agent/src/config.ts`: read `.tendril/config.json`, return typed `WorkspaceConfig` with defaults for missing fields, validate required fields (model.modelId, model.region)
- [x] T013 [P] Implement capability registry in `tendril-agent/src/registry.ts`: `CapabilityRegistry` class with `search(query)`, `register(definition, code)`, `load(name)`, `list()`, `exists(name)` methods operating on `index.json` and `tools/` directory
- [x] T014 [P] Implement Deno sandbox execution in `tendril-agent/src/sandbox.ts`: `executeDeno(code, args, workspacePath, denoPath, timeoutMs)` function that writes temp file, spawns Deno with scoped `--allow-read`, `--allow-write`, `--allow-net` permissions, captures stdout/stderr, enforces timeout via process kill, cleans up temp file
- [x] T015 [P] Create system prompt template in `tendril-agent/src/prompt.ts`: export `TENDRIL_SYSTEM_PROMPT(workspacePath)` function that returns the assembled system prompt string with workspace path interpolated; include registry-first behaviour instructions and tool authoring guidelines per project brief
- [x] T016 Implement ACP JSON-RPC 2.0 protocol handler in `tendril-agent/src/protocol.ts`: NDJSON line reader on stdin, JSON-RPC request router for `initialize`, `new_session`, `prompt`, `notifications/cancelled`; response writer and `session/update` notification emitter on stdout; stdin EOF detection for shutdown
- [x] T017 Implement Strands agent factory in `tendril-agent/src/agent.ts`: `createAgent(config, workspacePath)` function returning a configured `Agent` with `BedrockModel`, system prompt from `prompt.ts`, and four bootstrap tool instances
- [x] T018 [P] Implement bootstrap tool: `searchCapabilities` in `tendril-agent/src/tools/search.ts` using `tool()` with Zod schema, delegates to `registry.search(query)`
- [x] T019 [P] Implement bootstrap tool: `registerCapability` in `tendril-agent/src/tools/register.ts` using `tool()` with Zod schema for definition + code params, delegates to `registry.register()`
- [x] T020 [P] Implement bootstrap tool: `loadTool` in `tendril-agent/src/tools/load.ts` using `tool()` with Zod schema, delegates to `registry.load(name)`
- [x] T021 [P] Implement bootstrap tool: `execute` in `tendril-agent/src/tools/execute.ts` using `tool()` with Zod schema for code + optional args params, delegates to `sandbox.executeDeno()`
- [x] T022 Implement agent entry point in `tendril-agent/src/index.ts`: wire protocol handler to Strands agent, translate Strands `stream()` events to ACP `session/update` notifications per `contracts/strands-event-mapping.md`, emit `message_usage` then `query_result` then `prompt_complete` at turn end in correct order, handle cancellation via `agent.cancel()`, catch Bedrock auth errors and emit ACP `error` event
- [x] T023 Write integration test in `tendril-agent/tests/integration.test.ts`: spawn the agent as a subprocess, send initialize → new_session → prompt sequence via stdin, verify streamed events on stdout match ACP contract, verify turn-end ordering
- [x] T024 Implement Tauri ACP host handler in `tendril-ui/src-tauri/src/acp.rs`: spawn tendril-agent sidecar via `tauri-plugin-shell`, resolve bundled Deno sidecar path and pass to agent via `new_session` params `workingDirectory`, send `initialize` and `new_session` on startup, route user prompts as ACP `prompt` requests, handle `notifications/cancelled`, detect sidecar termination
- [x] T025 [P] Implement Tauri event emitter in `tendril-ui/src-tauri/src/events.rs`: parse NDJSON lines from sidecar stdout, match `sessionUpdate` type, emit corresponding Tauri events (`agent-message-chunk`, `tool-call`, `tool-call-update`, `message-usage`, `query-result`, `prompt-complete`, `session-lifecycle`)
- [x] T026 Wire Tauri plugins and commands in `tendril-ui/src-tauri/src/lib.rs`: register `tauri-plugin-shell`, expose async Tauri commands for `send_prompt(text)`, `cancel_prompt()`, `init_workspace(path)`, `read_capabilities(path)`, `read_config(path)`, `write_config(path, config)`, `get_system_prompt()`

**Checkpoint**: Agent builds and passes all tests. Tauri shell spawns and communicates with agent. ACP protocol flows end-to-end. No UI yet.

---

## Phase 3: User Story 1 — Converse with the Agentic Sandbox (Priority: P1)

**Goal**: User sends a message, sees streamed response with tool trace entries, token usage, and can cancel.

**Independent Test**: Launch app, type prompt, observe streamed text and tool traces in conversation view.

### Implementation for User Story 1

- [x] T027 [P] [US1] Create `AgentContext` provider in `tendril-ui/src/context/AgentContext.tsx`: React context holding session state (messages, activeToolCalls, tokenUsage, messageUsage, isProcessing, error), expose dispatch actions, no Tauri imports
- [x] T028 [P] [US1] Create `useAgent` hook in `tendril-ui/src/hooks/useAgent.ts`: subscribe to Tauri events (`agent-message-chunk`, `tool-call`, `tool-call-update`, `message-usage`, `query-result`, `prompt-complete`, `session-lifecycle`), update AgentContext state on each event, expose `sendPrompt(text)` and `cancelPrompt()` functions that invoke Tauri commands
- [x] T029 [P] [US1] Create `useSession` hook in `tendril-ui/src/hooks/useSession.ts`: manage session lifecycle state (connecting, connected, error), listen for `session-lifecycle` Tauri events, expose connection status
- [x] T030 [US1] Create `MessageBubble` component in `tendril-ui/src/components/MessageBubble.tsx`: renders a single message (user or assistant), supports streaming text (grows as chunks arrive), styled with TailwindCSS v4
- [x] T031 [P] [US1] Create `ToolTrace` component in `tendril-ui/src/components/ToolTrace.tsx`: renders a collapsible tool call entry showing tool name, kind, input params, and output on completion; styled with TailwindCSS v4
- [x] T032 [P] [US1] Create `TokenUsage` component in `tendril-ui/src/components/TokenUsage.tsx`: displays input tokens, output tokens, cost, duration, and per-message usage for a completed turn; styled with TailwindCSS v4
- [x] T033 [US1] Create `InputBar` component in `tendril-ui/src/components/InputBar.tsx`: text input with submit button; input MUST be disabled while `isProcessing` is true; cancel button visible when processing; calls `sendPrompt`/`cancelPrompt` from context; styled with TailwindCSS v4
- [x] T034 [US1] Create `ChatView` component in `tendril-ui/src/components/ChatView.tsx`: composes MessageBubble, ToolTrace, TokenUsage, and InputBar; reads from AgentContext; auto-scrolls on new content; styled with TailwindCSS v4
- [x] T035 [US1] Wire `App.tsx` in `tendril-ui/src/App.tsx`: wrap in AgentContext provider, render ChatView as main view, initialize agent connection on mount via useAgent hook

**Checkpoint**: User Story 1 fully functional — send messages, see streamed responses with tool traces, cancel, see token usage. Input disabled during processing.

---

## Phase 4: User Story 2 — Self-Extending Capability Registry (Priority: P1)

**Goal**: Agent creates new capabilities when needed, reuses existing ones, user can browse the registry.

**Independent Test**: Ask agent to fetch a URL (no existing tool), confirm tool created and registered. Ask again, confirm reuse. Browse capability list in UI.

### Implementation for User Story 2

- [x] T036 [P] [US2] Create `useCapabilities` hook in `tendril-ui/src/hooks/useCapabilities.ts`: invoke Tauri command `read_capabilities(workspacePath)` to load capability list, expose refresh function, provide capabilities array to context
- [x] T037 [US2] Create `CapabilityBrowser` component in `tendril-ui/src/components/CapabilityBrowser.tsx`: lists all capabilities with name, description, triggers, suppression rules, creation date, and created_by; styled with TailwindCSS v4; reads from useCapabilities hook
- [x] T038 [US2] Add capability browser navigation to `App.tsx` in `tendril-ui/src/App.tsx`: add a sidebar or tab to switch between ChatView and CapabilityBrowser; auto-refresh capability list after each prompt completion

**Checkpoint**: User Story 2 complete — agent creates, registers, and reuses capabilities; user browses registry in UI.

---

## Phase 5: User Story 3 — Workspace Initialisation and Configuration (Priority: P2)

**Goal**: First-run workspace setup, settings UI with local persistence, and system prompt visibility.

**Independent Test**: Launch with no workspace, complete setup, confirm directory structure created. Open settings, change model, confirm persisted to config.json. View system prompt.

### Implementation for User Story 3

- [x] T039 [P] [US3] Implement workspace initialisation in Tauri command `init_workspace` in `tendril-ui/src-tauri/src/lib.rs`: create `index.json` (empty registry), `tools/` directory, `.tendril/config.json` (defaults) at the specified path
- [x] T040 [US3] Create `WorkspaceSetup` component in `tendril-ui/src/components/WorkspaceSetup.tsx`: directory picker dialog, init button, progress/success feedback; calls `init_workspace` Tauri command; styled with TailwindCSS v4
- [x] T041 [P] [US3] Create `SettingsPanel` component in `tendril-ui/src/components/SettingsPanel.tsx`: form fields for model ID, region, sandbox timeout, max turns; reads current values via `read_config` Tauri command; saves via `write_config` Tauri command; includes read-only system prompt display via `get_system_prompt` Tauri command; styled with TailwindCSS v4
- [x] T042 [US3] Add workspace detection and settings navigation to `App.tsx` in `tendril-ui/src/App.tsx`: on launch check if workspace exists at configured path; if not, show WorkspaceSetup instead of ChatView; add settings navigation alongside capability browser

**Checkpoint**: All user stories independently functional. Full application workflow: init workspace → configure → converse → browse capabilities.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T043 [P] Add error state handling across all views: display ACP errors, Bedrock auth failures, Deno timeout errors, and network errors as user-friendly messages in ChatView and as toast notifications
- [x] T044 [P] Add loading/empty states: skeleton loaders for ChatView while connecting, empty state for CapabilityBrowser when registry is empty, connection status indicator in the UI header
- [x] T045 Build production Node.js SEA binary: validate `npm run build:sea` pipeline (esbuild → sea-config → postject), test sidecar launch from Tauri in release mode
- [x] T046 Build production Tauri app: validate `cargo tauri build`, confirm both sidecars (tendril-agent + deno) bundled with correct platform triple suffixes in `tendril-ui/src-tauri/binaries/`
- [x] T047 Run `specs/001-tendril-tauri-app/quickstart.md` validation: follow quickstart steps on a clean environment, verify all commands succeed and the app launches correctly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
  - Tests (T008-T011) written first, confirmed failing
  - Implementation (T012-T026) makes tests pass
- **User Stories (Phase 3-5)**: All depend on Foundational completion
  - US1, US2, and US3 can proceed in parallel (independent UI views)
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (Phase 2) only. No cross-story dependencies.
- **User Story 2 (P1)**: Depends on Foundational (Phase 2) only. Registry functionality already in Phase 2, US2 adds the UI view.
- **User Story 3 (P2)**: Depends on Foundational (Phase 2) only. Workspace init is a Tauri command, settings read/write config.json.

### Within Each User Story

- Context/hooks before components (components consume hook data)
- Leaf components before composite components (ChatView composes MessageBubble, ToolTrace, etc.)
- App.tsx wiring last (integrates all components)

### Parallel Opportunities

**Phase 1** (all [P] tasks):
```
T002 (agent package.json) | T003 (Tauri init) | T004 (tauri.conf) | T005 (capabilities) | T006 (sea-config) | T007 (types)
```

**Phase 2 Tests** (all [P]):
```
T008 (registry tests) | T009 (sandbox tests) | T010 (protocol tests) | T011 (config tests)
```

**Phase 2 Implementation** (after tests):
```
T012 (config) then: T013 (registry) | T014 (sandbox) | T015 (prompt)
Then: T018-T021 (tools, all [P])
Then: T016 (protocol) → T017 (agent factory) → T022 (entry point) → T023 (integration test)
And: T024 (ACP host) | T025 (events) → T026 (Tauri wiring)
```

**Phase 3** (US1):
```
T027 (AgentContext) | T028 (useAgent) | T029 (useSession) | T031 (ToolTrace) | T032 (TokenUsage)
```
Then: T030 (MessageBubble) → T033 (InputBar) → T034 (ChatView) → T035 (App.tsx)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (tests first, then implementation)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Send a prompt, see streamed response with tool traces
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Agent and Tauri shell communicate over ACP
2. Add User Story 1 → Conversational UI with streaming and tool traces (MVP!)
3. Add User Story 2 → Capability browser UI
4. Add User Story 3 → Workspace init, settings, system prompt display
5. Polish → Error handling, loading states, production builds

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Test-First: Phase 2 tests MUST be written and fail before implementation begins (Constitution VI)
- Commit after each task or logical group
- The agent can be developed and tested completely independently of the Tauri UI (use stdin/stdout piping)
- All React components use TailwindCSS v4 exclusively — no CSS modules or styled-components
- All Tauri commands are async — no synchronous backend calls
- Input MUST be disabled while agent is processing (FR-006)
- message_usage MUST be emitted at turn end for responsible token tracking
