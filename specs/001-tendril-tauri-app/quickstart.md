# Quickstart: Tendril Tauri Application

**Branch**: `001-tendril-tauri-app` | **Date**: 2026-04-11

## Prerequisites

- Node.js 22+ (for building the SEA agent)
- Rust toolchain (for Tauri shell)
- Deno runtime (for development; bundled in production)
- AWS credentials configured (`~/.aws/credentials` or environment)
- AWS Bedrock access enabled for Claude Sonnet 4.5 in your region

## Repository Structure

```
tendril/
  tendril-agent/              # TypeScript Strands sidecar
    src/
      index.ts                # ACP NDJSON stdio loop
      agent.ts                # Strands Agent configuration
      protocol.ts             # ACP JSON-RPC 2.0 handler
      registry.ts             # Capability registry CRUD + search
      sandbox.ts              # Deno subprocess execution
      config.ts               # Workspace config reader
      types.ts                # Shared type definitions
      tools/
        search.ts             # searchCapabilities tool
        register.ts           # registerCapability tool
        load.ts               # loadTool tool
        execute.ts            # execute tool
    package.json
    tsconfig.json
    sea-config.json
    vitest.config.ts

  tendril-ui/                 # Tauri + React desktop app
    src/                      # React frontend
      components/
        ChatView.tsx          # Conversation display
        MessageBubble.tsx     # Individual message
        ToolTrace.tsx         # Tool call trace entry
        InputBar.tsx          # User input
        CapabilityBrowser.tsx # Registry viewer
        SettingsPanel.tsx     # Config editor
        WorkspaceSetup.tsx    # First-run init
        TokenUsage.tsx        # Cost/token display
      hooks/
        useAgent.ts           # Tauri event bridge
        useSession.ts         # Session state
        useCapabilities.ts    # Registry state
      context/
        AgentContext.tsx       # Agent state provider
      App.tsx
      main.tsx
    src-tauri/                # Tauri Rust backend
      src/
        lib.rs                # Plugin registration, commands
        acp.rs                # ACP host protocol handler
        events.rs             # Tauri event emission
      Cargo.toml
      tauri.conf.json
      capabilities/           # Tauri permission grants
        default.json
      binaries/               # Sidecar binaries (build output)
        tendril-agent-{target-triple}
        deno-{target-triple}
    package.json
    tailwind.config.ts
    vite.config.ts

  docs/
  specs/
  README.md
```

## Development Setup

```bash
# 1. Build the agent
cd tendril-agent
npm install
npm run build          # esbuild bundle
npm test               # vitest

# 2. Build SEA (optional — for testing sidecar integration)
npm run build:sea      # esbuild + node SEA inject

# 3. Start the UI in dev mode
cd ../tendril-ui
npm install
cargo tauri dev        # Launches Tauri with React hot-reload
```

## Development vs Production Agent

In development, the Tauri app can spawn the agent directly via `node dist/main.cjs` (no SEA needed). The sidecar binary is only required for production builds.

## Testing the Agent Standalone

```bash
cd tendril-agent
echo '{"jsonrpc":"2.0","id":"init-1","method":"initialize","params":{"protocolVersion":"1.0.0","clientInfo":{"name":"test","version":"0.1.0"},"capabilities":{}}}' | node dist/main.cjs
```

## Workspace Init (Manual)

```bash
mkdir ~/tendril-workspace
echo '{"version":"1.0.0","capabilities":[]}' > ~/tendril-workspace/index.json
mkdir ~/tendril-workspace/tools
mkdir ~/tendril-workspace/.tendril
echo '{"model":{"provider":"bedrock","modelId":"us.anthropic.claude-sonnet-4-5","region":"us-east-1"},"sandbox":{"denoPath":"deno","timeoutMs":45000,"allowedDomains":["esm.sh","deno.land","cdn.jsdelivr.net"]},"registry":{"maxCapabilities":500},"agent":{"maxTurns":100}}' | jq . > ~/tendril-workspace/.tendril/config.json
```
