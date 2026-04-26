# Tendril

A self-extending agentic sandbox that demonstrates the **Agent Capability** pattern — where the model discovers, builds, and reuses tools autonomously across sessions.

Built with [AWS Strands Agents SDK](https://github.com/strands-agents/sdk-typescript) and [Tauri](https://tauri.app).

## What it does

You ask Tendril to do something. It checks its capability registry. If a tool exists, it uses it. If not, it **writes one**, registers it, and executes it — all without asking. Next time you need the same thing, the tool is already there.

```
You: "fetch the top stories from Hacker News"

Tendril:
  → searchCapabilities("fetch url hacker news")    # nothing found
  → registerCapability(fetch_url, code)             # builds a tool
  → execute(fetch_url, {url: "https://..."})        # runs it
  → "Here are the top stories: ..."

You: "now fetch Lobsters and compare"

Tendril:
  → searchCapabilities("fetch url")                 # found: fetch_url ✓
  → loadTool("fetch_url")                           # reuses it
  → execute(fetch_url, {url: "https://lobste.rs"})  # no rebuild needed
```

The registry grows with use. Every session is smarter than the last.

## The Agent Loop

The core of Tendril is a Strands agent with **four bootstrap tools**. That's it — four tools to rule them all.

### Where it lives

```
tendril-agent/src/
├── agent.ts              ← Agent configuration (Strands model + tools)
├── index.ts              ← Orchestrator — wires loop to transport
├── loop/                 ← The agentic loop
│   ├── tools.ts          ← 4 bootstrap tools in cycle order
│   ├── prompt.ts         ← System prompt (autonomous behaviour rules)
│   ├── registry.ts       ← Capability registry (index.json CRUD)
│   └── sandbox.ts        ← Deno subprocess execution with sandboxing
└── transport/            ← Conversation framing + stream observation
    ├── protocol.ts       ← ACP JSON-RPC over stdio
    ├── stream.ts         ← SDK events → loop phases (think/act/observe)
    └── errors.ts         ← Provider error classification
```

### How it works

**`agent.ts`** — Creates the Strands agent with a Bedrock model and four tools:

```typescript
import { Agent } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';

const agent = new Agent({
  model: new BedrockModel({ modelId: '...', region: '...' }),
  systemPrompt: TENDRIL_SYSTEM_PROMPT(workspacePath),
  printer: nullPrinter,   // suppress SDK stdout — we own the protocol
  tools: [
    searchCapabilities(workspacePath),
    registerCapability(workspacePath),
    loadTool(workspacePath),
    executeCode(workspacePath),
  ],
});
```

**`index.ts`** — Observes the agentic loop and bridges it to the ACP protocol:

```typescript
// The agentic loop runs inside agent.stream().
// We observe each phase and forward to the UI.
for await (const event of agent.stream(userText)) {
  const { phase, event: e } = classifyEvent(event);
  switch (phase) {
    case 'think':   emitUpdate(handleThink(e));    break;  // text delta
    case 'act':     emitUpdate(handleAct(e));      break;  // tool call
    case 'observe': emitUpdate(handleObserve(e));  break;  // tool result
  }
}
```

**`loop/prompt.ts`** — The system prompt that makes the agent autonomous:

```
BEFORE acting on any request:
1. Call searchCapabilities(query) to check if a relevant tool exists
2. If found: call loadTool(name) then execute(code, args)
3. If NOT found: you MUST build the tool yourself.

RULES:
- NEVER ask "would you like me to create a tool?" — just build it.
- If a tool fails, read the error, fix the code, and retry.
- NEVER answer from training data when a tool could get live information.
```

### The "too many tools" solution

Most agent frameworks give the model a big bag of tools and hope it picks the right one. Tendril inverts this — the model always sees exactly **four tools**. It searches a registry, builds what it needs, and the registry grows over time. The tool surface never changes; the capabilities do.

## Architecture

```
┌─────────────────────────────────────────┐
│ Tauri Shell (Rust)                      │
│                                         │
│  ACP Host ──stdin/stdout──► Agent       │
│  (acp.rs)    NDJSON        (Node.js SEA)│
│     │                         │         │
│  Events  ◄── session/update ──┘         │
│  (events.rs)                            │
│     │                                   │
│  Tauri Events ──►  React Frontend       │
│                    (TailwindCSS v4)     │
└─────────────────────────────────────────┘

Agent internals:
  Strands SDK ── BedrockModel ── Claude
       │
  4 bootstrap tools
       │
  ┌────┴────┐
  │ Registry │ ←→ index.json + tools/*.ts
  └─────────┘
       │
  ┌────┴────┐
  │ Sandbox  │ ←→ Deno subprocess (scoped permissions)
  └─────────┘
```

**Communication**: JSON-RPC 2.0 over NDJSON (newline-delimited JSON) on stdin/stdout. The agent is a standalone process — the Tauri host spawns it as a sidecar.

**Protocol**: Implements the [Agent Integrator Specification](docs/agent-integrator-spec.pdf) (ACP) — the same protocol used by Claude Code and similar agent hosts.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop shell | Tauri 2.x (Rust) |
| Frontend | React 18 + TailwindCSS v4 |
| Agent | TypeScript (Node.js SEA binary) |
| Agent framework | [@strands-agents/sdk](https://github.com/strands-agents/sdk-typescript) |
| Inference | AWS Bedrock (Claude via Strands BedrockModel) |
| Code sandbox | Deno (bundled, subprocess with permission flags) |
| Protocol | JSON-RPC 2.0 / NDJSON over stdio |

## Prerequisites

- **Node.js 22+** (for building the agent)
- **Rust toolchain** (for Tauri)
- **AWS credentials** configured for Bedrock access (`~/.aws/credentials`)

## Quick Start

```bash
git clone https://github.com/serverless-dna/tendril.git
cd tendril
make dev
```

This will:
1. Install dependencies (`npm install` for agent and UI)
2. Build the agent (`esbuild` bundle)
3. Download Deno (bundled as sidecar)
4. Create sidecar shims with platform triple
5. Launch Tauri dev mode

On first launch, pick a workspace folder. Configure your AWS profile and model in Settings.

## Configuration

All settings live at `~/.tendril/config.json`:

```json
{
  "workspace": "/Users/you/tendril-workspace",
  "model": {
    "provider": "bedrock",
    "modelId": "us.anthropic.claude-sonnet-4-5-20250514",
    "region": "us-east-1",
    "profile": "your-aws-profile"
  },
  "sandbox": {
    "denoPath": "deno",
    "timeoutMs": 45000,
    "allowedDomains": []
  },
  "agent": {
    "maxTurns": 100
  }
}
```

`allowedDomains`: empty = unrestricted network. Set `["api.example.com"]` to restrict.

## Capability Registry

Capabilities are stored in the workspace as plain files:

```
~/tendril-workspace/
  index.json          ← registry (name, triggers, suppression rules)
  tools/
    fetch_url.ts      ← tool implementation (TypeScript, runs in Deno)
    summarize_text.ts
    parse_json.ts
```

Each capability has:
- **name**: `snake_case` identifier
- **capability**: one-sentence description
- **triggers**: conversational signals that should invoke it
- **suppression**: conditions that prevent invocation

The model writes these definitions. You can inspect, edit, or delete them — they're just files.

## Makefile Targets

```
make dev       Build agent + sidecars, launch Tauri dev
make build     Build agent (esbuild bundle)
make test      Run agent tests (vitest)
make lint      tsc --noEmit + cargo clippy
make fmt       cargo fmt --check
make check     Full quality gate (fmt + lint + test)
make release   Quality gate + cargo tauri build
make clean     Remove all build artifacts
```

## Project Structure

```
tendril/
  tendril-agent/        TypeScript Strands sidecar
    src/                Agent source (see "The Agent Loop" above)
    tests/              vitest tests
    package.json
    sea-config.json     Node.js SEA build config

  tendril-ui/           Tauri + React desktop app
    src/                React components + hooks
    src-tauri/          Rust backend (ACP host, event forwarding)
    package.json

  docs/                 Specs and reference implementations
  specs/                Feature specifications and plans
  Makefile
```

## License

MIT
