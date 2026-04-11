# Tendril — Project Brief

## What is Tendril

Tendril is an open source agentic sandbox that demonstrates the Agency Tooling pattern — a self-extending capability registry where the model discovers, builds, and reuses tools autonomously across sessions.

It is a reference implementation of three concepts:
- **Code Mode** — single `run_code` tool backed by sandboxed TypeScript execution
- **Agency Capabilities** — tools with embedded trigger/suppression invocation policy
- **Self-extending registry** — model authors and registers capabilities when none exist

---

## Core behaviour

```
Model receives user request
  ↓
Search capability registry — does a tool exist for this?
  ↓
Found → load tool implementation → execute via run_code
  ↓
Not found → write TypeScript implementation
          → store to tools/
          → register with Agency Capability definition
          → execute
          → registry updated for next session
```

The registry grows with use. Every session is smarter than the last.

---

## Technology stack

| Component | Technology | Reason |
|---|---|---|
| Language | Rust | Performance, safety, Tauri compatibility |
| Model provider | AWS Bedrock (Claude Sonnet 4.5) | Frontier model required for reliable tool authoring |
| Execution sandbox | Deno binary (subprocess) | Full TypeScript + npm via esm.sh, Deno permission flags as sandbox boundary |
| Registry format | JSON (index.json) | Simple, model-readable, human-auditable |
| Tool storage | Filesystem (tools/*.ts) | Transparent, version-controllable, inspectable |
| Protocol | NDJSON / JSONRPC 2.0 over stdio | Existing ACP sidecar pattern |

---

## Project structure

```
tendril/
  crates/
    tendril-agent/         — sidecar binary (main.rs + ACP NDJSON loop)
    tendril-core/          — agentic loop, provider trait
    tendril-bedrock/       — AWS Bedrock provider (Converse API streaming)
    tendril-sandbox/       — Deno subprocess execution, path validation
    tendril-registry/      — capability registry CRUD, search
  tendril-ui/              — Tauri + React frontend
  docs/
    agency-tooling-spec.md   — the AT spec
    capability-schema.json   — JSON schema for capability definitions
  examples/
    capabilities/            — example Agency Capability definitions
  README.md
  SPEC.md
```

---

## Capability registry format

### index.json

```json
{
  "version": "1.0.0",
  "capabilities": [
    {
      "name": "fetch_url",
      "capability": "Fetches a URL and returns extracted readable text.",
      "triggers": [
        "user provides a URL and asks about its contents",
        "user asks to save or summarise a specific web page"
      ],
      "suppression": [
        "URL was already fetched this session",
        "user is asking about a topic generally with no specific URL"
      ],
      "tool_path": "tools/fetch_url.ts",
      "created": "2026-04-11",
      "created_by": "model",
      "version": "1.0.0"
    }
  ]
}
```

### tools/fetch_url.ts

```typescript
// Tool implementation — authored by model, stored for reuse
const url = args.url as string;
const response = await fetch(url);
const text = await response.text();
// strip HTML tags
const clean = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
console.log(clean.substring(0, 3000));
```

---

## The four bootstrap tools

These are the only hardcoded tools. Everything else the model builds.

```typescript
// 1. Search registry — find existing capabilities
declare function searchCapabilities(query: string): Capability[];

// 2. Register capability — store new capability definition + implementation
declare function registerCapability(
  definition: CapabilityDefinition,
  code: string
): void;

// 3. Load tool — get implementation code for a capability
declare function loadTool(name: string): string;

// 4. Execute — run TypeScript in Deno sandbox
declare function execute(code: string, args?: Record<string, unknown>): string;
```

These four tools are injected as globals into every Deno execution context.

---

## Agency Capability definition schema

```typescript
interface CapabilityDefinition {
  name: string;              // snake_case identifier
  capability: string;        // one sentence — what, not when
  triggers: string[];        // 2-5 observable conversational signals
  suppression: string[];     // conditions that override triggers
  tool_path: string;         // relative path to TypeScript implementation
  created: string;           // ISO date
  created_by: "model" | "human";
  version: string;           // semver
}
```

---

## System prompt

```
You are Tendril, an agentic assistant with a self-extending toolkit.

Your workspace is at {workspace_path}.
Your capability registry is at {workspace_path}/index.json.
Your tool implementations are at {workspace_path}/tools/*.ts.

BEFORE acting on any request:
1. Call searchCapabilities(query) to check if a relevant tool exists
2. If found: call loadTool(name) then execute(code, args)
3. If not found: write the TypeScript implementation, then call registerCapability(definition, code)

WHEN WRITING A CAPABILITY DEFINITION:
- capability: one sentence, what the tool does, no trigger language
- triggers: 2-5 observable conversational signals that should cause invocation
- suppression: conditions that prevent invocation even when triggers match
- name: snake_case, descriptive, specific

WHEN WRITING TOOL IMPLEMENTATIONS:
- TypeScript, runs in Deno with fetch available
- External packages via: import * as x from "https://esm.sh/{package}"
- args object contains parameters passed at execution time
- Output via console.log() — captured as tool result
- Keep implementations focused and single-purpose

SANDBOX:
- Read/write scoped to {workspace_path}
- fetch() available, scoped to allowed domains
- No shell access, no process spawning

ACT immediately. Do not narrate. Do not explain what you are about to do.
Check the registry first. Always.
```

---

## Bedrock provider — tendril-bedrock

### Implementation requirements

```rust
pub struct BedrockProvider {
    client: aws_sdk_bedrockruntime::Client,
    model_id: String,  // "us.anthropic.claude-sonnet-4-5"
    region: String,
}

impl Provider for BedrockProvider {
    fn load(&mut self) -> Result<(), ProviderError>;
    fn generate(
        &self,
        messages: &[ConversationMessage],
        tools: &[ToolDefinition],
        on_token: &dyn Fn(&str),
    ) -> Result<GenerateOutput, ProviderError>;
    fn cancel(&self);
}
```

### Converse API streaming

Use `aws_sdk_bedrockruntime::Client::converse_stream`.

Message translation:
```rust
// ConversationMessage → Bedrock Message
Role::User      → MessageRole::User
Role::Assistant → MessageRole::Assistant
Role::System    → system prompt field (not messages array)
Role::ToolResult → ToolResultBlock inside User message
```

Tool call detection:
```rust
// Stream events to watch
ConverseStreamOutput::ContentBlockStart — if tool_use block: capture id + name
ConverseStreamOutput::ContentBlockDelta — if tool_use: accumulate input JSON
ConverseStreamOutput::ContentBlockStop  — if tool_use: emit StopReason::ToolCall
ConverseStreamOutput::MessageStop      — emit StopReason::EndOfTurn
```

Token streaming:
```rust
ConverseStreamOutput::ContentBlockDelta(delta) => {
    if let Some(text) = delta.delta().text() {
        on_token(text);
    }
}
```

### Tool definitions — Bedrock format

```rust
// Bootstrap tools as Bedrock ToolSpec
fn bootstrap_tool_specs() -> Vec<Tool> {
    vec![
        Tool::ToolSpec(ToolSpecification::builder()
            .name("searchCapabilities")
            .description("Search the capability registry...")
            .input_schema(ToolInputSchema::Json(...))
            .build()),
        // registerCapability, loadTool, execute
    ]
}
```

### AWS credentials

Standard credential chain via `aws-config` — picks up `~/.aws/credentials`, environment variables, instance profile. Region from `AWS_DEFAULT_REGION` or config.

### Cargo dependencies

```toml
[dependencies]
aws-sdk-bedrockruntime = "1"
aws-config = { version = "1", features = ["behavior-version-latest"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
tracing = "0.1"
```

---

## Sandbox — tendril-sandbox

### Deno subprocess execution

```rust
pub struct DenoSandbox {
    workspace: PathBuf,
    deno_path: PathBuf,      // bundled or system deno
    timeout_ms: u64,
}

impl DenoSandbox {
    pub async fn execute(&self, code: &str, args: Value) -> SandboxResult;
}
```

### Execution model

1. Write code to temp file in workspace
2. Prepend bootstrap globals (searchCapabilities, registerCapability, loadTool, execute)
3. Spawn deno with scoped permissions
4. Capture stdout as tool output
5. Capture stderr as error
6. Enforce timeout via process kill

```rust
Command::new(&self.deno_path)
    .args([
        "run",
        &format!("--allow-read={}", self.workspace.display()),
        &format!("--allow-write={}", self.workspace.display()),
        "--allow-net=esm.sh,deno.land,cdn.jsdelivr.net",
        "--no-prompt",
        "--quiet",
        &script_path,
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
```

### Bootstrap globals prelude

```typescript
// Injected before every user script execution
const __registry_path = "{workspace}/index.json";
const __tools_path = "{workspace}/tools";

function searchCapabilities(query: string): any[] {
  const index = JSON.parse(Deno.readTextFileSync(__registry_path));
  const q = query.toLowerCase();
  return index.capabilities.filter((c: any) =>
    c.name.includes(q) ||
    c.capability.toLowerCase().includes(q) ||
    c.triggers.some((t: string) => t.toLowerCase().includes(q))
  );
}

function registerCapability(definition: any, code: string): void {
  const index = JSON.parse(Deno.readTextFileSync(__registry_path));
  const existing = index.capabilities.findIndex(
    (c: any) => c.name === definition.name
  );
  if (existing >= 0) {
    index.capabilities[existing] = definition;
  } else {
    index.capabilities.push(definition);
  }
  Deno.writeTextFileSync(__registry_path, JSON.stringify(index, null, 2));
  Deno.writeTextFileSync(`${__tools_path}/${definition.name}.ts`, code);
}

function loadTool(name: string): string {
  return Deno.readTextFileSync(`${__tools_path}/${name}.ts`);
}
```

---

## Registry — tendril-registry

### Operations

```rust
pub struct CapabilityRegistry {
    index_path: PathBuf,
    tools_path: PathBuf,
}

impl CapabilityRegistry {
    pub fn search(&self, query: &str) -> Vec<Capability>;
    pub fn register(&self, def: CapabilityDefinition, code: &str) -> Result<()>;
    pub fn load(&self, name: &str) -> Result<String>;
    pub fn list(&self) -> Vec<Capability>;
    pub fn exists(&self, name: &str) -> bool;
}
```

### Search implementation

Simple term overlap — no embeddings needed at personal scale:

```rust
pub fn search(&self, query: &str) -> Vec<Capability> {
    let query_terms: Vec<&str> = query.split_whitespace().collect();
    let index = self.load_index();
    
    index.capabilities.iter()
        .filter_map(|cap| {
            let searchable = format!(
                "{} {} {}",
                cap.name,
                cap.capability,
                cap.triggers.join(" ")
            ).to_lowercase();
            
            let score = query_terms.iter()
                .filter(|t| searchable.contains(&t.to_lowercase()))
                .count();
            
            if score > 0 { Some((cap.clone(), score)) } else { None }
        })
        .sorted_by_key(|(_, score)| Reverse(*score))
        .map(|(cap, _)| cap)
        .collect()
}
```

---

## Agentic loop — tendril-core

### Loop behaviour

```rust
pub async fn run_loop(
    provider: &dyn Provider,
    registry: &CapabilityRegistry,
    sandbox: &DenoSandbox,
    messages: &mut Vec<ConversationMessage>,
    max_turns: u32,
) -> LoopResult {
    let tools = bootstrap_tool_definitions();
    
    for turn in 0..max_turns {
        let result = provider.generate(messages, &tools, &|token| {
            print!("{}", token);
        })?;
        
        match result.stop_reason {
            StopReason::ToolCall => {
                let tool_result = dispatch_tool(
                    &result.tool_call,
                    registry,
                    sandbox,
                ).await?;
                
                messages.push(assistant_message(&result.text, &result.tool_call));
                messages.push(tool_result_message(&tool_result));
            }
            StopReason::EndOfTurn => {
                messages.push(assistant_message(&result.text, &None));
                return Ok(LoopResult::Complete);
            }
            StopReason::Interrupted => return Ok(LoopResult::Interrupted),
        }
    }
    
    Ok(LoopResult::TurnLimitReached)
}
```

### Tool dispatch

```rust
async fn dispatch_tool(
    call: &ToolCall,
    registry: &CapabilityRegistry,
    sandbox: &DenoSandbox,
) -> Result<String> {
    match call.name.as_str() {
        "searchCapabilities" => {
            let query = call.args["query"].as_str().unwrap_or("");
            let results = registry.search(query);
            Ok(serde_json::to_string(&results)?)
        }
        "registerCapability" => {
            let def: CapabilityDefinition = serde_json::from_value(
                call.args["definition"].clone()
            )?;
            let code = call.args["code"].as_str().unwrap_or("");
            registry.register(def, code)?;
            Ok("Capability registered.".to_string())
        }
        "loadTool" => {
            let name = call.args["name"].as_str().unwrap_or("");
            registry.load(name)
        }
        "execute" => {
            let code = call.args["code"].as_str().unwrap_or("");
            let args = call.args.get("args").cloned().unwrap_or_default();
            let result = sandbox.execute(code, args).await?;
            Ok(result.stdout)
        }
        unknown => Err(anyhow::anyhow!("Unknown tool: {}", unknown))
    }
}
```

---

## CLI interface

The `tendril-agent` binary exposes a CLI for direct use without the UI:

```
tendril-agent init [path]             — initialise workspace with empty registry
tendril-agent run                     — start ACP sidecar (UI connects here)
tendril-agent run --prompt "..."      — single prompt, non-interactive CLI mode
tendril-agent capabilities list       — show registered capabilities
tendril-agent capabilities show X     — show capability definition + implementation
tendril-agent capabilities delete X   — remove capability
tendril-agent model set <model-id>    — set Bedrock model
```

The Tauri UI spawns `tendril-agent run` as a sidecar and communicates via NDJSON over stdio.

---

## Workspace initialisation

```
tendril-agent init ~/tendril-workspace

Creates:
  ~/tendril-workspace/
    index.json        ← empty capability registry
    tools/            ← tool implementations directory
    .tendril/
      config.toml     ← model, region, settings
```

### config.toml

```toml
[model]
provider = "bedrock"
model_id = "us.anthropic.claude-sonnet-4-5"
region = "us-east-1"

[sandbox]
deno_path = "deno"          # system deno or bundled path
timeout_ms = 45000
allowed_domains = ["esm.sh", "deno.land", "cdn.jsdelivr.net"]

[registry]
max_capabilities = 500
```

---

## Build order

1. `tendril-registry` — no dependencies, start here
2. `tendril-sandbox` — depends on path validation only
3. `tendril-bedrock` — depends on provider trait
4. `tendril-core` — wires registry + sandbox + provider
5. `tendril-agent` — ACP sidecar binary, thin wrapper over tendril-core
6. `tendril-ui` — Tauri + React, spawns tendril-agent as sidecar

---

## Success criteria

A working Tendril session looks like this:

```
$ tendril-agent run --prompt "fetch the content from https://news.ycombinator.com and summarise the top stories"

[searching capabilities: "fetch url web content"]
No capability found for web fetching. Building...
[registering: fetch_url]
[executing: fetch_url]
[result: 3000 chars of HN content]
[searching capabilities: "summarise text content"]  
No capability found. Building...
[registering: summarise_text]
[executing: summarise_text]

Top stories on Hacker News today:
1. ...
2. ...

Tendril ready. Workspace: ~/tendril-workspace (2 capabilities)

> fetch https://lobste.rs and compare with HN

[searching capabilities: "fetch url web content"]
Found: fetch_url ✓
[loading: fetch_url]
[executing with url=https://lobste.rs]
...
```

Second request reuses the capability built in the first. The registry grows. Subsequent sessions inherit the full toolkit.

---

## What Tendril is not

- Not a personal assistant (no scheduling, email, calendar)
- Not a coding agent (no git, no file editing beyond workspace)
- Not a platform (no multi-user, no governance, no RBAC)
- Not a product (a reference implementation and spec)

Tendril demonstrates the Agency Tooling pattern at personal scale. The enterprise story is for later.

---

## Deliverables

1. Working Rust sidecar binary (`tendril-agent`) with Bedrock provider
2. `agency-tooling-spec.md` — formal specification
3. `README.md` — setup, usage, architecture overview
4. Example capabilities in `examples/capabilities/`
5. `tendril-ui` — Tauri + React frontend (trace view, chat, capability browser)
6. MIT license

## Repository

`github.com/serverless-dna/tendril`
