# tendril-agent

The agentic sidecar for Tendril — a TypeScript process that implements the ACP (Agent Communication Protocol) over NDJSON/JSON-RPC 2.0 on stdin/stdout, powered by the [AWS Strands Agents SDK](https://github.com/strands-agents/sdk-typescript).

## Architecture

```
stdin (JSON-RPC 2.0)                    stdout (JSON-RPC 2.0)
       │                                       ▲
       ▼                                       │
┌─────────────────────────────────────────────────────┐
│  protocol.ts — NDJSON line reader / JSON-RPC router │
│    initialize, new_session, prompt, cancel, shutdown│
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│  index.ts — Stream event translator                  │
│    Strands events → ACP session/update notifications │
│    modelStreamUpdateEvent → agent_message_chunk      │
│    beforeToolCallEvent    → tool_call                │
│    toolResultEvent        → tool_call_update         │
│    modelMetadataEvent     → query_result             │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│  agent.ts — Strands Agent                            │
│    BedrockModel (Claude via AWS Bedrock)             │
│    System prompt from prompt.ts                      │
│    Null printer (stdout reserved for protocol)       │
│    4 bootstrap tools ↓                               │
└──────────────────────┬───────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │search.ts │  │register  │  │execute.ts│
  │load.ts   │  │  .ts     │  │          │
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       │              │              │
       ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │registry  │  │registry  │  │sandbox   │
  │  .ts     │  │  .ts     │  │  .ts     │
  │          │  │          │  │  (Deno)  │
  └──────────┘  └──────────┘  └──────────┘
       │              │              │
       ▼              ▼              ▼
   index.json    tools/*.ts    Deno subprocess
```

## The Four Bootstrap Tools

The model always sees exactly four tools. Everything else it builds on demand.

| Tool | What it does | Delegates to |
|------|-------------|-------------|
| `searchCapabilities` | Find existing tools by keyword | `registry.ts` — term overlap search on name, capability, triggers |
| `registerCapability` | Store a new tool definition + code | `registry.ts` — writes to `index.json` + `tools/{name}.ts` |
| `loadTool` | Read a tool's TypeScript source | `registry.ts` — reads `tools/{name}.ts` |
| `execute` | Run TypeScript in the Deno sandbox | `sandbox.ts` — spawns Deno with scoped permissions |

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point. Stdout guard, config loading, Strands stream → ACP event translation |
| `src/protocol.ts` | JSON-RPC 2.0 request router. Handles initialize, new_session, prompt, cancel |
| `src/agent.ts` | Creates the Strands `Agent` with BedrockModel, null printer, and four tools |
| `src/prompt.ts` | System prompt. Autonomous behaviour rules — never ask, always build |
| `src/registry.ts` | `CapabilityRegistry` class. CRUD + keyword search over `index.json` |
| `src/sandbox.ts` | `executeDeno()`. Spawns Deno subprocess with `--allow-read`, `--allow-write`, `--allow-net` |
| `src/config.ts` | Reads `~/.tendril/config.json`. Model, region, profile, sandbox settings |
| `src/types.ts` | TypeScript interfaces for capabilities, config, ACP messages |

## ACP Protocol (stdin/stdout)

The agent speaks JSON-RPC 2.0 over NDJSON. One JSON object per newline.

**Host → Agent (stdin):**
- `initialize` → responds with agent info
- `new_session` → responds with session ID, emits `connected` lifecycle
- `prompt` → responds immediately (empty), then streams events
- `notifications/cancelled` → stops current turn

**Agent → Host (stdout):**
- `agent_message_chunk` — streamed text token
- `tool_call` — tool execution announced
- `tool_call_update` — tool execution completed/failed
- `message_usage` — per-message token counts
- `query_result` — authoritative cost + tokens for the turn
- `prompt_complete` — turn finished (always last)

Turn-end ordering: `message_usage` → `query_result` → `prompt_complete`

## Stdout Guard

The Strands SDK writes text directly to stdout via its built-in printer. Since stdout is reserved for the ACP protocol (NDJSON only), the agent intercepts `process.stdout.write` and redirects non-JSON output to stderr. The Strands printer is also replaced with a null printer.

## Configuration

Reads from `~/.tendril/config.json`:

```json
{
  "workspace": "/path/to/workspace",
  "model": {
    "modelId": "us.anthropic.claude-sonnet-4-5-20250514",
    "region": "us-east-1",
    "profile": "aws-profile-name"
  },
  "sandbox": {
    "denoPath": "/path/to/deno",
    "timeoutMs": 45000,
    "allowedDomains": []
  },
  "agent": { "maxTurns": 100 }
}
```

`AWS_PROFILE` is set from `model.profile` before Strands SDK init.

## Build

```bash
npm install
npm run build        # esbuild → dist/main.cjs
npm test             # vitest
npm run build:sea    # Node.js SEA binary (production)
```

## Standalone Usage

```bash
# Pipe JSON-RPC messages on stdin
echo '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{"protocolVersion":"1.0.0","clientInfo":{"name":"test","version":"0.1.0"},"capabilities":{}}}' | node dist/main.cjs
```

## Dependencies

- `@strands-agents/sdk` — Agent framework + Bedrock provider
- `zod` — Tool input schema validation

Dev: `esbuild`, `vitest`, `typescript`
