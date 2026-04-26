# Agent Capability Specification

**Version**: 1.0.0  
**Status**: Draft  
**Date**: 2026-04-25

---

## Abstract

Agent Capability (AC) is a pattern for LLM-driven applications in which the model discovers, authors, and reuses tools autonomously. Rather than shipping a fixed toolset, an AC system provides exactly four bootstrap operations — search, register, load, and execute — and a persistent capability registry. The model composes new tools at runtime, stores them for reuse, and retrieves them in future sessions. The registry grows with use; every session is smarter than the last.

This document specifies the pattern, its data model, its operational protocol, and its security boundary. It is implementation-agnostic: any runtime, model provider, or sandbox technology may be used provided it satisfies the constraints defined here.

---

## 1. Design Principles

| # | Principle | Statement |
|---|-----------|-----------|
| P1 | **Minimal bootstrap** | The system exposes exactly four hardcoded tools. All other tools are model-authored. |
| P2 | **Search-first** | Every user request MUST begin with a registry search. The model MUST NOT skip this step. |
| P3 | **Self-extending** | When no matching capability exists, the model writes the implementation, registers it, and executes it — all in one turn. |
| P4 | **Persistent** | The registry and tool implementations survive across sessions. A new session inherits the full registry from prior sessions. |
| P5 | **Sandboxed** | All model-authored code executes in a sandboxed subprocess with scoped filesystem and network permissions. No shell access, no process spawning. |
| P6 | **Auditable** | Capabilities are stored as human-readable JSON definitions and plain-text source files. The registry is inspectable, editable, and version-controllable. |

---

## 2. Core Concepts

### 2.1 Capability

A **capability** is a named, reusable tool consisting of:

- A **definition** — structured metadata describing what the tool does and when to invoke it.
- An **implementation** — source code executed in a sandbox at invocation time.

Capabilities are the fundamental unit of the registry. They are created by the model (or by a human) and stored on the filesystem.

### 2.2 Capability Registry

The **capability registry** is a persistent index of all capabilities available in a workspace. It is stored as a JSON file (`tools/index.json`) alongside the tool implementation files (`tools/*.ts`).

The registry supports three operations: **search**, **register** (upsert), and **load**.

### 2.3 Bootstrap Tools

**Bootstrap tools** are the only hardcoded tools in the system. They provide the model with the minimum operations needed to manage and use the registry. There are exactly four:

| Tool | Purpose |
|------|---------|
| `listCapabilities` | List all registered capabilities for the model to read |
| `registerCapability` | Store a new capability definition and implementation |
| `loadTool` | Retrieve the source code of a registered capability |
| `execute` | Run code in the sandbox |

No additional hardcoded tools are permitted. If the system needs a new tool, the model builds it.

### 2.4 Sandbox

The **sandbox** is an isolated execution environment for model-authored code. It enforces:

- **Filesystem scope** — read/write limited to the workspace directory.
- **Network scope** — outbound requests limited to an approved domain list.
- **No shell access** — no child process spawning, no OS command execution.
- **Timeout** — execution is time-bounded; exceeding the limit terminates the process.

### 2.5 Invocation Policy

Each capability carries an **invocation policy** — a set of signals that guide the model on when to use (or not use) the tool:

- **Triggers** — observable conversational signals that suggest the tool should be invoked.
- **Suppression** — conditions that override triggers and prevent invocation.

The invocation policy is advisory. It is consumed by the model as part of the search results and system prompt context, not enforced programmatically.

---

## 3. Data Model

### 3.1 CapabilityDefinition

```typescript
interface CapabilityDefinition {
  name: string;                        // snake_case identifier, unique within registry
  capability: string;                  // one sentence — what the tool does, not when
  triggers: string[];                  // 2–5 observable conversational signals
  suppression: string[];               // conditions that override triggers
  tool_path: string;                   // relative path to implementation file
  created: string;                     // ISO 8601 date
  created_by: "model" | "human";       // author
  version: string;                     // semver
}
```

**Constraints**:

| Field | Constraint |
|-------|-----------|
| `name` | MUST match `/^[a-z0-9_]+$/`. MUST be unique within the registry. |
| `capability` | MUST be a single sentence. MUST describe *what* the tool does, not *when* to invoke it. |
| `triggers` | MUST contain 2–5 entries. Each entry is a natural-language description of an observable conversational signal. |
| `suppression` | MAY be empty. Each entry describes a condition that prevents invocation even when triggers match. |
| `tool_path` | MUST be a relative path within the `tools/` directory. Conventionally `tools/{name}.ts`. |
| `created_by` | `"model"` for model-authored capabilities, `"human"` for manually authored ones. |
| `version` | MUST follow semver. Starts at `"1.0.0"`. Incremented on updates. |

### 3.2 CapabilityIndex

```typescript
interface CapabilityIndex {
  version: string;                     // schema version, currently "1.0.0"
  capabilities: CapabilityDefinition[];
}
```

The index is stored at `{workspace}/tools/index.json`.

### 3.3 Workspace Layout

```
{workspace}/
  tools/
    index.json              # CapabilityIndex
    fetch_url.ts            # implementation for "fetch_url" capability
    parse_csv.ts            # implementation for "parse_csv" capability
    ...
```

Tool implementations are plain TypeScript files. They receive input via a pre-injected `args` object and produce output via `console.log()`.

---

## 4. Bootstrap Tool Specifications

### 4.1 listCapabilities

**Purpose**: Return the full capability registry for the model to read and reason over.

**Input**: None (no parameters).

**Output**: Array of capability summaries, each containing only the fields needed for tool selection:

```typescript
{ name: string; capability: string; triggers: string[]; suppression: string[] }
```

Metadata fields (`tool_path`, `created`, `created_by`, `version`) are omitted to reduce token usage.

**Behaviour when registry is empty**: Returns an empty array. The model SHOULD interpret this as a signal to create a new capability.

**Design rationale**: The model is better at semantic matching than any keyword search algorithm. At personal scale (tens to low hundreds of capabilities), the full index fits comfortably within context. Returning the complete registry lets the model read triggers and suppression in context and make its own selection decision.

### 4.2 registerCapability

**Purpose**: Store a new capability (or update an existing one) in the registry.

**Input**:

```typescript
{
  definition: {
    name: string;
    capability: string;
    triggers: string[];
    suppression: string[];
  },
  code: string               // TypeScript source code
}
```

**Behaviour**:

1. Validate `name` matches `/^[a-z0-9_]+$/`.
2. Enrich the definition with system-managed fields: `tool_path`, `created`, `created_by: "model"`, `version`.
3. If a capability with the same `name` exists, replace it (upsert). Otherwise, append.
4. Write the updated index to `tools/index.json`.
5. Write the implementation to `tools/{name}.ts`.

**Output**: Confirmation message.

### 4.3 loadTool

**Purpose**: Retrieve the source code of a registered capability.

**Input**:

```typescript
{ name: string }
```

**Output**: The contents of `tools/{name}.ts` as a string.

**Error**: If the tool file does not exist, return an error message.

### 4.4 execute

**Purpose**: Run arbitrary TypeScript code in the sandbox.

**Input**:

```typescript
{
  code: string;                        // TypeScript source code
  args?: Record<string, unknown>;      // arguments injected as `args` global
}
```

**Behaviour**:

1. Prepend a prelude injecting `args` and `__workspace` as globals.
2. Write the complete script to a temporary file.
3. Spawn the sandbox subprocess with scoped permissions.
4. Capture stdout as the tool result, stderr as diagnostics.
5. Enforce timeout — kill the process if exceeded.
6. Clean up the temporary file.

**Output**: The captured stdout of the execution.

---

## 5. Operational Protocol

### 5.1 The List-First Rule

Every user request MUST follow this sequence:

```
1. listCapabilities() — read the full registry
2. IF a matching capability exists:
     a. loadTool(name)
     b. execute(loaded code, args)
3. IF no match:
     a. Write TypeScript implementation
     b. registerCapability(definition, code)
     c. execute(code, args)
```

The model MUST NOT skip step 1. The model MUST NOT answer from memory when a tool could provide live data.

### 5.2 Capability Authoring Guidelines

When the model creates a new capability, the following conventions apply:

| Aspect | Guideline |
|--------|-----------|
| `capability` field | One sentence. Describes *what*, not *when*. Example: "Fetches a URL and returns extracted readable text." |
| `triggers` | 2–5 entries. Each is an observable signal from the conversation. Example: "user provides a URL and asks about its contents". |
| `suppression` | Conditions that prevent invocation. Example: "URL was already fetched this session". |
| `name` | `snake_case`, descriptive, specific. Example: `fetch_url`, not `get` or `url_tool`. |
| Implementation | Single-purpose. Uses `console.log()` for output. Imports via `https://esm.sh/{package}` for external dependencies. Accesses `args` for parameters and `__workspace` for filesystem paths. |

### 5.3 Capability Lifecycle

```
          ┌──────────────────────────────┐
          │         NOT EXISTS            │
          └──────────┬───────────────────┘
                     │ registerCapability()
                     ▼
          ┌──────────────────────────────┐
          │          REGISTERED          │◄──── registerCapability() (upsert)
          └──────────┬───────────────────┘
                     │ listCapabilities() → loadTool() → execute()
                     ▼
          ┌──────────────────────────────┐
          │           IN USE             │
          └──────────────────────────────┘
```

Capabilities are never automatically deleted. Removal is a manual operation (human edits `index.json` or deletes the tool file).

---

## 6. Sandbox Specification

### 6.1 Permission Model

| Permission | Scope | Rationale |
|-----------|-------|-----------|
| Filesystem read | `{workspace}/` only | Tool code may read registry, other tools, and workspace data |
| Filesystem write | `{workspace}/` only | Tool code may write output files and update registry |
| Network | Approved domain list | External API access (e.g., `esm.sh`, user-configured domains) |
| Process spawning | Denied | No shell access, no child processes |
| Environment variables | Denied | No access to host secrets |
| Prompt | Denied (`--no-prompt`) | Sandbox must never request elevated permissions interactively |

### 6.2 Execution Environment

The sandbox MUST provide:

- Full TypeScript support.
- A `fetch()` API for HTTP requests (subject to network scope).
- An `args` global containing the parameters passed via `execute()`.
- A `__workspace` global containing the absolute workspace path.
- `console.log()` as the output mechanism (captured as tool result).

### 6.3 Timeout

Every sandbox execution MUST be time-bounded. If the process exceeds the configured timeout, it MUST be forcibly terminated (SIGKILL or equivalent). The tool result MUST indicate a timeout error.

### 6.4 Temporary Files

The `execute` tool writes the composed script (prelude + user code) to a temporary file in the OS temp directory before spawning the sandbox subprocess. No other bootstrap tool creates temporary files. Temporary files MUST be cleaned up in a `finally` block after execution completes — whether the execution succeeds, fails, or is killed by timeout.

---

## 7. Registry Integrity

### 7.1 Corruption Handling

If `tools/index.json` is missing or contains invalid JSON, the registry MUST behave as if empty (zero capabilities). It MUST NOT crash or propagate the error. A subsequent `registerCapability` call will create a valid index.

### 7.2 Orphan Handling

If a capability references a `tool_path` that does not exist on disk, `loadTool` MUST return an error for that capability. The registry index is not automatically repaired.

### 7.3 Capacity

Implementations MAY enforce a maximum number of capabilities. The default limit is 500.

---

## 8. System Prompt Contract

An AC-compliant system MUST instruct the model with the following behavioural directives (paraphrased — exact wording is implementation-specific):

1. **List first**: Before acting on any request, call `listCapabilities()` and read the results.
2. **Load and execute**: If a matching capability is found, load its code and execute it.
3. **Author and register**: If no capability is found, write the implementation, register it, then execute it.
4. **Capability definition conventions**: Describe *what* not *when*; use observable triggers; include suppression conditions.
5. **Implementation conventions**: TypeScript, single-purpose, `console.log()` output, external imports via CDN URL.
6. **Act immediately**: Do not narrate intent. Do not explain what you are about to do. Execute.

---

## 9. Conformance

An implementation is **AC-conformant** if it satisfies all of the following:

1. Exposes exactly four bootstrap tools as defined in §4.
2. Persists capabilities using the data model defined in §3.
3. Follows the list-first operational protocol defined in §5.1.
4. Enforces sandbox boundaries as defined in §6.
5. Handles registry corruption gracefully as defined in §7.1.
6. Instructs the model per the system prompt contract in §8.

An implementation MAY extend the specification (e.g., additional search algorithms, capability versioning policies, remote registry sync) provided extensions do not violate the constraints above.

---

## Appendix A: Example Capability

### Definition (in `tools/index.json`)

```json
{
  "name": "fetch_url",
  "capability": "Fetches a URL and returns extracted readable text.",
  "triggers": [
    "user provides a URL and asks about its contents",
    "user asks to save or summarise a specific web page",
    "user pastes a link and asks what it says"
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
```

### Implementation (`tools/fetch_url.ts`)

```typescript
const url = args.url as string;
const response = await fetch(url);
const text = await response.text();
const clean = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
console.log(clean.substring(0, 3000));
```

---

## Appendix B: Bootstrap Tool Schemas

For model providers that require formal tool definitions (e.g., Bedrock, OpenAI function calling), the four bootstrap tools have the following input schemas:

```json
{
  "listCapabilities": {
    "type": "object",
    "properties": {},
    "required": []
  },
  "registerCapability": {
    "type": "object",
    "properties": {
      "definition": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "snake_case identifier" },
          "capability": { "type": "string", "description": "One sentence — what the tool does" },
          "triggers": {
            "type": "array",
            "items": { "type": "string" },
            "description": "2-5 observable conversational signals"
          },
          "suppression": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Conditions that prevent invocation"
          }
        },
        "required": ["name", "capability", "triggers", "suppression"]
      },
      "code": { "type": "string", "description": "TypeScript implementation source code" }
    },
    "required": ["definition", "code"]
  },
  "loadTool": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Capability name to load" }
    },
    "required": ["name"]
  },
  "execute": {
    "type": "object",
    "properties": {
      "code": { "type": "string", "description": "TypeScript code to execute in sandbox" },
      "args": { "type": "object", "description": "Arguments injected as the `args` global" }
    },
    "required": ["code"]
  }
}
```
