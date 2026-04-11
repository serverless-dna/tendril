# Research: Tendril Tauri Application

**Branch**: `001-tendril-tauri-app` | **Date**: 2026-04-11

## R1: Strands TypeScript SDK

**Decision**: Use `@strands-agents/sdk` (npm) as the agentic framework.

**Rationale**: Production-grade Bedrock provider, built-in agentic loop with tool calling, streaming via AsyncGenerator, cancellation via `agent.cancel()`, and multi-turn conversation management. Eliminates need for custom agentic loop and Bedrock provider.

**Alternatives considered**:
- Custom TypeScript agentic loop: More control but significant build effort for no novel value.
- LangChain.js: Heavier dependency, more abstraction layers than needed.

**Key findings**:
- Package: `@strands-agents/sdk` (not `@strands/agent` as in the project brief addendum)
- BedrockModel: `import { BedrockModel } from '@strands-agents/sdk/models/bedrock'`
- Tool definitions use `tool()` with Zod schemas or JSON Schema
- Streaming: `agent.stream()` returns `AsyncGenerator<AgentStreamEvent, AgentResult>`
- Key events: `ModelStreamUpdateEvent` (text tokens), `BeforeToolCallEvent`, `ToolResultEvent`, `AgentResultEvent`
- Cancellation: `agent.cancel()` using AbortController internally
- Token usage: `result.metrics.accumulatedUsage` provides `inputTokens`, `outputTokens`
- No built-in cost calculation — compute from token counts
- Multi-turn: `SlidingWindowConversationManager` (default, 40 messages)
- Hooks via `agent.addHook(EventType, handler)` — no callback-style API

## R2: Node.js Single Executable Application (SEA)

**Decision**: Build tendril-agent as a Node.js SEA binary targeting Node 22 LTS.

**Rationale**: Ships as a single binary without requiring Node.js on the target machine. `child_process.spawn` works in SEA mode (critical for Deno sandbox). Well-documented pipeline with esbuild.

**Alternatives considered**:
- Bun compile: Simpler but less mature, uncertain AWS SDK compatibility.
- Deno compile: Would conflict with using Deno as the sandbox runtime.
- Ship with Node.js runtime: Larger distribution, user setup friction.

**Key findings**:
- SEA is Stability 1.1 (Active Development) — not stable, but functional
- Pipeline: esbuild bundle (CJS) → sea-config.json → `node --experimental-sea-config` → postject inject → codesign (macOS)
- `child_process.spawn` works — built-in modules are fully available
- Binary size: ~70-100MB (entire Node.js runtime embedded)
- Cross-platform: CI matrix builds required (cannot cross-compile code caches)
- `useCodeCache: true` for native builds, `false` for cross-platform blob sharing
- `disableExperimentalSEAWarning: true` in sea-config.json

## R3: Tauri 2.x Sidecar Pattern

**Decision**: Bundle both the Node.js SEA agent and Deno binary as Tauri sidecars via `bundle.externalBin`.

**Rationale**: Tauri's sidecar system handles platform-specific binary resolution, bundling into the app package, and provides a clean spawn API with stdin/stdout communication via `tauri-plugin-shell`.

**Alternatives considered**:
- Manual binary management: More complex, platform-specific path resolution.
- Single sidecar with embedded Deno: Node.js SEA cannot embed another runtime.

**Key findings**:
- Config: `bundle.externalBin: ["binaries/tendril-agent", "binaries/deno"]` in tauri.conf.json
- Plugin: `tauri-plugin-shell` (crate + npm package) required
- Spawn: `app.shell().sidecar("tendril-agent")` → `.spawn()` → `(Receiver<CommandEvent>, CommandChild)`
- Communication: `child.write(bytes)` for stdin, `CommandEvent::Stdout(bytes)` for stdout
- Line-buffered by default — suitable for NDJSON (one JSON per line)
- Platform naming: binary must have target triple suffix (e.g., `tendril-agent-aarch64-apple-darwin`)
- Permissions: `shell:allow-spawn` and `shell:allow-stdin-write` grants needed per sidecar
- The agent sidecar spawns Deno internally via `child_process.spawn` — Deno is NOT spawned by Tauri directly. Deno binary is bundled as an externalBin but resolved by the agent at runtime via a known relative path or passed as config.

## R4: ACP Protocol Layer Architecture

**Decision**: Custom TypeScript protocol layer wrapping Strands agent. The protocol layer handles NDJSON I/O, JSON-RPC 2.0 routing, and translates between ACP events and Strands streaming events.

**Rationale**: Strands SDK has no knowledge of ACP. The protocol layer is a thin adapter: it reads JSON-RPC requests from stdin, dispatches to the Strands agent, and translates Strands stream events into ACP `session/update` notifications written to stdout.

**Key mapping**:
| Strands Event | ACP Notification |
|---|---|
| `ModelStreamUpdateEvent` | `agent_message_chunk` |
| `BeforeToolCallEvent` | `tool_call` |
| `ToolResultEvent` | `tool_call_update` (status: completed) |
| `AgentResultEvent` | `query_result` + `prompt_complete` |

## R5: Workspace Configuration

**Decision**: JSON config file at `.tendril/config.json`. No environment variables.

**Rationale**: Consistent with registry format (index.json), zero parser dependencies in TypeScript, readable by both the agent and Tauri host.

**Config schema**:
```json
{
  "model": {
    "provider": "bedrock",
    "modelId": "us.anthropic.claude-sonnet-4-5",
    "region": "us-east-1"
  },
  "sandbox": {
    "denoPath": "deno",
    "timeoutMs": 45000,
    "allowedDomains": ["esm.sh", "deno.land", "cdn.jsdelivr.net"]
  },
  "registry": {
    "maxCapabilities": 500
  },
  "agent": {
    "maxTurns": 100
  }
}
```

Note: `denoPath` defaults to `"deno"` (system PATH) during development. In production, the Tauri host resolves the bundled Deno sidecar path and passes it to the agent via the `new_session` params or a separate mechanism.
