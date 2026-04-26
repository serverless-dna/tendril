# Feature Specification: Tendril Tauri Application

**Feature Branch**: `001-tendril-tauri-app`  
**Created**: 2026-04-11  
**Status**: Draft  
**Input**: User description: "Tendril Tauri app with React FE, TailwindCSS v4, standalone ACP agent (Node.js SEA via AWS Strands SDK) with agentic loop, AWS Bedrock provider, compliant with Agent Integrator Specification"

## User Scenarios & Testing

### User Story 1 - Converse with the Agentic Sandbox (Priority: P1)

A user opens the Tendril desktop application and sends a natural-language request. The agent processes the request through its agentic loop, streaming text responses token-by-token back to the chat interface. The user sees the assistant's response appear progressively in real time. If the agent needs to use tools (search the capability registry, execute code, register new capabilities), those tool invocations and their results are visible in the UI as collapsible trace entries alongside the conversation.

**Why this priority**: This is the core interaction loop. Without conversational exchange and visible streaming, Tendril has no usable surface. Everything else builds on this.

**Independent Test**: Can be fully tested by launching the app, typing a prompt, and observing streamed text and tool-call trace entries in the conversation view.

**Acceptance Scenarios**:

1. **Given** the application is running and connected to the agent, **When** the user types a message and submits it, **Then** the agent's response streams token-by-token into the conversation view within 2 seconds of submission.
2. **Given** the agent invokes a tool during processing, **When** the tool call begins, **Then** a trace entry appears in the UI showing the tool name, kind, and input parameters, and updates with output on completion.
3. **Given** the user submits a request, **When** the agent finishes responding, **Then** token usage and cost information for the turn is displayed.
4. **Given** the agent is streaming a response, **When** the user presses a cancel control, **Then** the response stops within 5 seconds and the UI returns to the input-ready state.

---

### User Story 2 - Self-Extending Capability Registry (Priority: P1)

A user asks Tendril to perform a task for which no tool exists in the capability registry. The agent searches the registry, finds nothing, writes a new TypeScript tool implementation, registers it as a capability with trigger and suppression rules, then executes it to fulfil the request. On a subsequent request matching the same triggers, the agent finds and reuses the existing capability rather than rebuilding it.

**Why this priority**: The self-extending registry is the defining behaviour of the Agent Capability pattern. Without it, Tendril is a generic chat wrapper.

**Independent Test**: Can be tested by sending a request that requires a tool not in the registry (e.g., "fetch this URL"), confirming the tool is created and registered, then sending a similar request and confirming the existing tool is reused.

**Acceptance Scenarios**:

1. **Given** the capability registry is empty, **When** the user asks the agent to perform a task requiring a new tool, **Then** the agent creates a capability definition and TypeScript implementation, registers them, and executes the tool to produce a result.
2. **Given** a capability has been previously registered, **When** the user sends a request whose triggers match that capability, **Then** the agent loads and executes the existing tool without creating a new one.
3. **Given** the registry contains capabilities, **When** the user browses the capability list in the UI, **Then** each capability shows its name, description, trigger rules, and creation date.

---

### User Story 3 - Workspace Initialisation and Configuration (Priority: P2)

A user launches Tendril for the first time and selects or creates a workspace directory. The application initialises the workspace with an empty capability registry, a tools directory, and a configuration file. The user can view and change settings such as the model ID, AWS region, and sandbox timeout through the application's settings interface.

**Why this priority**: Users need a clear onboarding path and the ability to configure their agent before productive use. Depends on the core conversation loop being functional.

**Independent Test**: Can be tested by launching the app with no existing workspace, completing the workspace setup flow, and confirming the expected directory structure and config file are created.

**Acceptance Scenarios**:

1. **Given** no workspace exists at the selected path, **When** the user triggers workspace initialisation, **Then** the application creates `index.json`, `tools/`, and `.tendril/config.json` at the workspace root.
2. **Given** a workspace is initialised, **When** the user opens the settings view, **Then** the current model, region, and sandbox timeout are displayed and editable.
3. **Given** the user changes a configuration option, **When** the change is saved, **Then** the setting is persisted locally to the workspace config file. The agent reads config at startup; runtime config push to the agent is deferred.

---

### Edge Cases

- What happens when the Bedrock provider returns an authentication error (expired or missing AWS credentials)?
- What happens when the Deno sandbox times out during tool execution?
- What happens when the capability registry file is corrupted or missing at startup?
- What happens when the agent reaches the maximum turn limit during a single request?
- What happens when the user submits a new prompt while the agent is still processing a previous one?
- What happens when network connectivity is lost mid-stream from Bedrock?

## Requirements

### Functional Requirements

#### Host Application (Tauri + React)

- **FR-001**: The application MUST launch the tendril-agent as a sandboxed subprocess and communicate with it exclusively via JSON-RPC 2.0 over NDJSON on stdin/stdout, compliant with the Agent Integrator Specification v1.0.0.
- **FR-002**: The application MUST implement the minimum viable ACP host protocol sequence: initialize, new_session, prompt cycle, cancel, and shutdown. Deferred to a later increment: authenticate, config change, session history, and session restore.
- **FR-003**: The application MUST render streamed agent text responses progressively as tokens arrive via `agent_message_chunk` events.
- **FR-004**: The application MUST display tool invocations as expandable trace entries showing tool name, kind, input, progress, and completion status via `tool_call` and `tool_call_update` events.
- **FR-005**: The application MUST display token usage and cost per turn from `query_result` events.
- **FR-006**: The application MUST disable message input while a prompt is being processed and re-enable it upon receiving `prompt_complete`. The application MUST support user-initiated cancellation of an active prompt by sending `notifications/cancelled` and transitioning back to input-ready state upon receiving `prompt_complete`.
- **FR-007**: *(Deferred)* The application MUST persist the `acp_session_id` from the `connected` lifecycle event and pass it as `resumeSessionId` on subsequent launches.
- **FR-008**: *(Deferred)* The application MUST handle the `request_permission` flow, presenting Allow/Deny options to the user and returning the selection to the agent.
- **FR-009**: *(Deferred)* The application MUST provide a settings interface allowing configuration of model, region, and permission mode, sending changes to the agent via `set_session_config_option`.
- **FR-010**: The application MUST provide a capability browser view showing all registered capabilities with their definitions.
- **FR-011**: The application MUST present workspace initialisation when no workspace exists at the configured path.
- **FR-012**: The application MUST style all UI components using TailwindCSS v4.
- **FR-029**: The application MUST display the active system prompt in the settings or an accessible view. The system prompt is assembled by the agent and surfaced to the user for transparency.

#### Agent Sidecar (tendril-agent — Node.js SEA, TypeScript, Strands SDK)

- **FR-013**: The agent MUST implement the minimum viable ACP agent protocol: initialize, new_session, prompt, notifications/cancelled, query_result, prompt_complete, and shutdown. The ACP protocol layer is custom TypeScript wrapping the Strands agent. Deferred to a later increment: set_session_config_option, get_session_history, request_permission, and session restore (resumeSessionId).
- **FR-014**: The agent MUST respond to `initialize` within 30 seconds with agent info and supported auth methods.
- **FR-015**: The agent MUST emit the `connected` lifecycle event with a resumable `acp_session_id` after session creation.
- **FR-016**: The agent MUST respond to `prompt` immediately with an empty result, then process asynchronously via stream events.
- **FR-017**: The agent MUST emit `agent_message_chunk` events for streamed text, `tool_call` and `tool_call_update` events for tool use, `query_result` for cost/token accounting, and `prompt_complete` at every turn boundary.
- **FR-018**: The agent MUST emit the final three events in order at turn end: `message_usage`, `query_result`, `prompt_complete`.
- **FR-019**: The agent MUST handle `notifications/cancelled` by stopping the current turn and emitting `prompt_complete` with stop_reason `interrupted` (or `interrupt_safety_timeout` if unable to stop within 5 seconds).
- **FR-020**: The agent MUST use the Strands SDK agentic loop with a configurable maximum turn limit, providing the four bootstrap tools: searchCapabilities, registerCapability, loadTool, and execute.
- **FR-021**: The agent MUST use the Strands Bedrock provider for inference via AWS Bedrock Converse Streaming API. No custom Bedrock implementation.
- **FR-022**: The agent MUST execute tool code in a Deno subprocess sandbox (spawned via Node.js child_process using the bundled Deno sidecar binary) with permissions scoped to the workspace directory and approved network domains only.
- **FR-023**: The agent MUST detect stdin EOF and perform a clean shutdown, exiting with code 0.
- **FR-024**: *(Deferred)* The agent MUST emit `config_option_update` after session creation, advertising configurable options (model selection, permission mode).
- **FR-025**: *(Deferred)* The agent MUST send `request_permission` to the host before executing tools that require user approval, blocking until the host responds.
- **FR-026**: The agent MUST be packaged as a Node.js Single Executable Application (SEA). Build pipeline: esbuild bundle, Node SEA inject, platform binary. No Node.js runtime required on the target machine.
- **FR-027**: The capability registry (index.json CRUD, search) MUST be implemented in TypeScript within the tendril-agent package.
- **FR-028**: The Deno sandbox execution (subprocess spawn, permission scoping, timeout enforcement) MUST be implemented in TypeScript within the tendril-agent package.

### Key Entities

- **Workspace**: A user-owned directory containing the capability registry, tool implementations, and agent configuration. Root of the sandbox boundary.
- **Capability**: A registered tool with a name, description, trigger rules, suppression rules, and a reference to its TypeScript implementation file.
- **Session**: A resumable conversation context identified by a unique session ID, containing message history and state.
- **Turn**: A single prompt-response cycle within a session, potentially involving multiple tool calls within the agentic loop.
- **Tool Call**: An invocation of one of the four bootstrap tools (searchCapabilities, registerCapability, loadTool, execute) during agent processing.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can send a message and see the first streamed token appear within 3 seconds of submission.
- **SC-002**: The agent successfully creates, registers, and executes a new capability on first encounter of an unknown task within a single conversation turn.
- **SC-003**: Previously registered capabilities are found and reused without re-creation on subsequent matching requests, verified across separate sessions.
- **SC-004**: Users can cancel an in-progress response and return to the input-ready state within 5 seconds.
- **SC-005**: The capability registry grows across sessions — capabilities created in session N are available in session N+1 without user intervention.
- **SC-006**: Token usage and cost are displayed accurately for each turn, matching the values reported by the provider.
- **SC-007**: Workspace initialisation completes successfully on first launch, producing a valid and usable workspace directory structure.
- **SC-008**: The application handles provider authentication failures gracefully, displaying a clear error message without crashing.
- **SC-009**: Tool execution respects sandbox boundaries — attempts to access files outside the workspace or unapproved network domains are denied.
- **SC-010**: The full ACP protocol sequence (initialize through prompt_complete) completes without protocol errors on every session startup.

## Clarifications

### Session 2026-04-11

- Q: Are tendril-registry and tendril-sandbox Rust crates or TypeScript? → A: All four Rust crates are dropped. tendril-registry replaced by registry.ts, tendril-sandbox replaced by sandbox.ts, tendril-core replaced by Strands SDK, tendril-bedrock replaced by Strands Bedrock provider. Zero Rust crates in the project — only Rust is the Tauri shell.
- Q: ACP protocol compliance scope at launch? → A: Minimum viable — initialize, new_session, prompt, cancel, query_result, prompt_complete, shutdown. Defer set_session_config_option, get_session_history, request_permission, and session restore to a later increment.
- Q: Deno bundling strategy? → A: Bundle Deno binary inside the Tauri app as a second sidecar resource alongside the Node.js SEA agent.
- Q: User Story 4 (Session Persistence) and US3 settings scope? → A: Drop US4 entirely. Keep US3 including settings UI — settings stored locally, not sent to agent via ACP until set_session_config_option is implemented.
- Q: Workspace config format? → A: JSON (`.tendril/config.json`). No environment variables for configuration — all settings come from the config file. Consistent with registry format.

## Assumptions

- Users have valid AWS credentials configured via standard credential chain (~/.aws/credentials, environment variables, or instance profile) for Bedrock access.
- Deno runtime is bundled inside the Tauri application as a second sidecar resource alongside the Node.js SEA agent binary. No external Deno installation required on the target machine.
- The target deployment platform is macOS desktop (primary), with Linux and Windows as future targets.
- The application operates in single-user mode — no multi-user, multi-tenant, or collaborative features are in scope.
- Network connectivity is required for Bedrock inference; offline operation is out of scope.
- The capability registry is stored on the local filesystem; cloud sync or sharing of registries is out of scope.
- The agent does not require authentication from the host (empty `authMethods` array), since it runs as a local sidecar.
- The system prompt is assembled by the agent from its built-in template and the workspace configuration, not supplied entirely by the host.
