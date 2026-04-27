# Implementation Plan: Tendril Tauri Application

**Branch**: `001-tendril-tauri-app` | **Date**: 2026-04-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-tendril-tauri-app/spec.md`

## Summary

Tendril is an agentic sandbox desktop application demonstrating the Agent Capability pattern — a self-extending capability registry where the model discovers, builds, and reuses tools autonomously. The implementation uses a Tauri 2.x shell (Rust) hosting a React frontend, with a TypeScript agent sidecar built on the Strands SDK and packaged as a Node.js SEA binary. Communication between host and agent follows the ACP Agent Integrator Specification v1.0.0 over NDJSON/JSON-RPC 2.0.

## Technical Context

**Language/Version**: TypeScript 5.x (agent), Rust (Tauri shell), React 18+ (frontend)
**Primary Dependencies**: `@strands-agents/sdk` (agent), `tauri-plugin-shell` (IPC), TailwindCSS v4 (styling)
**Storage**: Filesystem — `index.json` (registry), `.tendril/config.json` (config), `tools/*.ts` (implementations)
**Testing**: vitest (agent), cargo test (Tauri Rust), React Testing Library (components)
**Target Platform**: macOS desktop (primary), Linux/Windows future
**Project Type**: Desktop application (Tauri) + agent sidecar (Node.js SEA)
**Performance Goals**: First token within 3 seconds, cancel within 5 seconds
**Constraints**: Main thread non-blocking, async-only IPC, no environment variables for config
**Scale/Scope**: Single user, single workspace, ~5 React views, ~10 TypeScript modules

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Async-First | PASS | Tauri async commands, dedicated tokio tasks for sidecar I/O, Strands async streaming |
| II. Event-Driven State | PASS | Tauri events forward agent stream events to React state |
| III. Component Isolation | PASS | Custom hooks bridge Tauri events; components receive props/context only |
| IV. Protocol Compliance | PASS | MVP subset implemented: initialize, new_session, prompt, cancel, shutdown. Turn-end ordering enforced |
| V. Sandboxed Execution | PASS | Deno subprocess with scoped permissions, time-bounded, bundled as sidecar |
| VI. Test-First | PASS | vitest for agent, cargo test for Tauri, RTL for React |
| VII. Simplicity | PASS | Four bootstrap tools only, single workspace/user/provider, no speculative features |

No violations. No complexity tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-tendril-tauri-app/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── acp-protocol.md
│   └── strands-event-mapping.md
└── tasks.md
```

### Source Code (repository root)

```text
tendril-agent/
├── src/
│   ├── index.ts              # Entry point: NDJSON stdio loop
│   ├── agent.ts              # Strands Agent factory
│   ├── protocol.ts           # ACP JSON-RPC 2.0 request router
│   ├── registry.ts           # Capability registry CRUD + search
│   ├── sandbox.ts            # Deno subprocess execution
│   ├── config.ts             # Workspace config reader
│   ├── prompt.ts             # System prompt template
│   ├── types.ts              # Shared type definitions
│   └── tools/
│       ├── search.ts         # searchCapabilities
│       ├── register.ts       # registerCapability
│       ├── load.ts           # loadTool
│       └── execute.ts        # execute (Deno sandbox)
├── tests/
│   ├── protocol.test.ts      # ACP message handling
│   ├── registry.test.ts      # Registry CRUD + search
│   ├── sandbox.test.ts       # Deno execution
│   └── integration.test.ts   # End-to-end ACP sequence
├── package.json
├── tsconfig.json
├── sea-config.json
└── vitest.config.ts

tendril-ui/
├── src/
│   ├── components/
│   │   ├── ChatView.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── ToolTrace.tsx
│   │   ├── InputBar.tsx
│   │   ├── CapabilityBrowser.tsx
│   │   ├── SettingsPanel.tsx
│   │   ├── WorkspaceSetup.tsx
│   │   └── TokenUsage.tsx
│   ├── hooks/
│   │   ├── useAgent.ts
│   │   ├── useSession.ts
│   │   └── useCapabilities.ts
│   ├── context/
│   │   └── AgentContext.tsx
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs
│   │   ├── acp.rs
│   │   └── events.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   └── binaries/
│       ├── tendril-agent-{triple}
│       └── deno-{triple}
├── package.json
├── tailwind.config.ts
└── vite.config.ts
```

**Structure Decision**: Two-package monorepo. `tendril-agent/` is a standalone TypeScript project that builds to a Node.js SEA binary. `tendril-ui/` is a Tauri + React application that bundles the agent as a sidecar. Packages are independent — the agent can be developed and tested without Tauri.

## Complexity Tracking

No violations to justify.
