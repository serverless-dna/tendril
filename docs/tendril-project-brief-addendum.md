# Tendril — Project Brief Addendum
## Architecture change: Strands TypeScript SDK replaces custom Rust agentic loop

---

## What changed and why

The original brief specified a custom Rust agentic loop (`tendril-core`) and custom Bedrock provider (`tendril-bedrock`). Both are replaced by the **AWS Strands TypeScript SDK** (`@strands/agent`).

Reasons:
- Strands ships a production-grade Bedrock provider — no custom implementation needed
- Strands handles the agentic loop, tool calling, streaming, and multi-turn conversation
- TypeScript Strands SDK is consistent with the existing Claude SDK sidecar pattern already in use
- The innovation in Tendril is the Agency Capability registry, not the agentic loop
- Dramatically reduces build scope — focus on what's novel
- Ship the tendril-agent as a NodeJs SEA
    - tendril-agent ships as a Node SEA binary.
        Build pipeline: esbuild bundle → Node SEA inject → platform binary.
        Tauri bundles the binary as a sidecar resource.
        No Node.js runtime required on target machine.

---

## Revised project structure

```
github.com/serverless-dna/tendril
  tendril-agent/          ← TypeScript Strands sidecar (replaces tendril-core + tendril-bedrock)
    src/
      index.ts            ← ACP NDJSON stdio loop
      agent.ts            ← Strands Agent configuration
      tools/
        search.ts         ← searchCapabilities tool
        register.ts       ← registerCapability tool
        execute.ts        ← execute tool (Deno subprocess)
        load.ts           ← loadTool tool
    package.json
    tsconfig.json

  tendril-registry/       ← KEEP — Rust crate, registry CRUD + search
  tendril-sandbox/        ← KEEP — Rust crate, Deno subprocess execution
  tendril-ui/             ← KEEP — Tauri + React frontend
  docs/
    agent-capability-spec.md
  README.md
  SPEC.md
```

**Dropped entirely:**
- `tendril-core/` — replaced by Strands agent loop
- `tendril-bedrock/` — replaced by Strands Bedrock provider

---

## tendril-agent implementation

### Dependencies

```json
{
  "name": "tendril-agent",
  "dependencies": {
    "@strands/agent": "latest",
    "readline": "^1.3.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### agent.ts — Strands agent with four bootstrap tools

```typescript
import { Agent, tool } from '@strands/agent';
import { searchCapabilities } from './tools/search';
import { registerCapability } from './tools/register';
import { loadTool } from './tools/load';
import { executeCode } from './tools/execute';
import { TENDRIL_SYSTEM_PROMPT } from './prompt';

export function createAgent(workspacePath: string) {
  return new Agent({
    model: {
      provider: 'bedrock',
      modelId: 'us.anthropic.claude-sonnet-4-5',
      region: process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
    },
    systemPrompt: TENDRIL_SYSTEM_PROMPT(workspacePath),
    tools: [
      searchCapabilities(workspacePath),
      registerCapability(workspacePath),
      loadTool(workspacePath),
      executeCode(workspacePath),
    ],
  });
}
```

### tools/search.ts

```typescript
import { tool } from '@strands/agent';
import { CapabilityRegistry } from '../registry';

export const searchCapabilities = (workspacePath: string) =>
  tool({
    name: 'searchCapabilities',
    description: 'Search the capability registry for existing tools matching the query. Call this before writing any new code.',
    parameters: {
      query: { type: 'string', description: 'What capability to search for' }
    },
    handler: async ({ query }) => {
      const registry = new CapabilityRegistry(workspacePath);
      return registry.search(query);
    }
  });
```

### tools/register.ts

```typescript
import { tool } from '@strands/agent';
import { CapabilityRegistry } from '../registry';
import { CapabilityDefinition } from '../types';

export const registerCapability = (workspacePath: string) =>
  tool({
    name: 'registerCapability',
    description: 'Register a new Agency Capability definition and store its TypeScript implementation to the registry.',
    parameters: {
      definition: {
        type: 'object',
        description: 'Agency Capability definition — name, capability, triggers, suppression',
        properties: {
          name:        { type: 'string' },
          capability:  { type: 'string' },
          triggers:    { type: 'array', items: { type: 'string' } },
          suppression: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'capability', 'triggers', 'suppression']
      },
      code: { type: 'string', description: 'TypeScript implementation to store' }
    },
    handler: async ({ definition, code }) => {
      const registry = new CapabilityRegistry(workspacePath);
      await registry.register(definition as CapabilityDefinition, code);
      return `Registered: ${definition.name}`;
    }
  });
```

### tools/execute.ts

```typescript
import { tool } from '@strands/agent';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export const executeCode = (workspacePath: string) =>
  tool({
    name: 'execute',
    description: 'Execute TypeScript code in the Deno sandbox. Output via console.log() is returned as the result.',
    parameters: {
      code: { type: 'string', description: 'TypeScript code to execute' },
      args: { type: 'object', description: 'Optional arguments object passed to the code', required: false }
    },
    handler: async ({ code, args }) => {
      return executeDeno(code, args ?? {}, workspacePath);
    }
  });

async function executeDeno(
  code: string,
  args: Record<string, unknown>,
  workspacePath: string,
  timeoutMs = 45000
): Promise<string> {
  const prelude = buildPrelude(workspacePath, args);
  const script = `${prelude}\n${code}`;
  const tmpFile = path.join(workspacePath, `.tendril-exec-${Date.now()}.ts`);

  fs.writeFileSync(tmpFile, script);

  try {
    return await new Promise((resolve, reject) => {
      const proc = spawn('deno', [
        'run',
        `--allow-read=${workspacePath}`,
        `--allow-write=${workspacePath}`,
        '--allow-net=esm.sh,deno.land,cdn.jsdelivr.net',
        '--no-prompt',
        '--quiet',
        tmpFile,
      ]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => stdout += d.toString());
      proc.stderr.on('data', (d) => stderr += d.toString());

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`Execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve(stdout.trim() || '(no output)');
        else reject(new Error(stderr.trim() || `Exit code ${code}`));
      });
    });
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

function buildPrelude(workspacePath: string, args: Record<string, unknown>): string {
  return `
const args = ${JSON.stringify(args)};
const __workspace = ${JSON.stringify(workspacePath)};
`;
}
```

### index.ts — ACP NDJSON stdio loop

```typescript
import * as readline from 'readline';
import { createAgent } from './agent';

const workspacePath = process.env.TENDRIL_WORKSPACE ?? process.cwd();
const agent = createAgent(workspacePath);

const rl = readline.createInterface({ input: process.stdin });

// Emit ready signal
process.stdout.write(JSON.stringify({
  jsonrpc: '2.0',
  method: 'notifications/ready',
  params: { agent: 'tendril-agent', version: '0.1.0' }
}) + '\n');

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const msg = JSON.parse(trimmed);

    if (msg.method === 'prompt') {
      const { messages, sessionId } = msg.params;
      const userMessage = messages.at(-1)?.content ?? '';

      // Stream tokens back via NDJSON
      await agent.stream(userMessage, {
        onToken: (token: string) => {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              update: { sessionUpdate: 'agent_message_chunk', text: token }
            }
          }) + '\n');
        },
        onToolCall: (name: string, input: unknown) => {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              update: { sessionUpdate: 'tool_call', title: name, input }
            }
          }) + '\n');
        },
        onToolResult: (name: string, result: unknown) => {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              update: { sessionUpdate: 'tool_call_update', status: 'success', rawOutput: result }
            }
          }) + '\n');
        }
      });

      // Emit completion
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: { sessionUpdate: 'prompt_complete', stop_reason: 'end_turn' }
        }
      }) + '\n');
    }
  } catch (e) {
    process.stderr.write(`Error: ${e}\n`);
  }
});
```

---

## Revised build order

1. `tendril-registry/` — Rust crate, registry CRUD + search (unchanged)
2. `tendril-sandbox/` — Rust crate, Deno path validation (unchanged)
3. `tendril-agent/` — TypeScript Strands sidecar (replaces tendril-core + tendril-bedrock)
4. `tendril-ui/` — Tauri + React frontend (unchanged)

---

## Revised deliverables

| Original | Revised |
|---|---|
| `tendril-core` Rust crate | Dropped — Strands handles this |
| `tendril-bedrock` Rust crate | Dropped — Strands Bedrock provider |
| `tendril-agent` Rust binary | TypeScript Strands sidecar |
| `tendril-registry` Rust crate | Unchanged |
| `tendril-sandbox` Rust crate | Unchanged |
| `tendril-ui` Tauri + React | Unchanged |

---

## What stays exactly the same

- ACP NDJSON / JSONRPC 2.0 wire protocol — identical
- Capability registry format (index.json) — identical
- Tool implementations (tools/*.ts) — identical
- Deno sandbox execution — identical
- Agent Capability spec — identical
- System prompt — identical
- Tauri UI — identical

The only change is the language and framework of the agentic loop. Everything the Tauri UI touches is unchanged.

---

## AWS credentials

Standard credential chain — Strands picks up `~/.aws/credentials`, environment variables, or instance profile automatically via the AWS SDK. No configuration needed beyond having credentials in place.

---

## Note on Strands SDK version

Use the TypeScript SDK: `github.com/strands-agents/sdk-typescript`. Active development — pin to a specific version in package.json. Check for streaming API stability before relying on `agent.stream()` — the Python SDK marks bidirectional streaming as experimental; verify TypeScript SDK status at build time.
