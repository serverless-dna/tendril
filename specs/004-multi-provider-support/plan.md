# Implementation Plan: Multi-Provider Model Support

**Branch**: `code-review` (worktree) | **Date**: 2026-04-16 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/004-multi-provider-support/spec.md`

## Summary

Refactor the tendril-agent and tendril-ui to support multiple model providers (Bedrock, Ollama, OpenAI, Anthropic) via the Strands SDK. The config schema moves from flat Bedrock-only fields to nested provider blocks with a discriminant. API keys for cloud providers are stored in a Tauri Stronghold encrypted vault and injected as environment variables at agent spawn time. The settings UI gains a provider selector with dynamic form fields and save-time validation for required credentials.

Key technical insight: The Strands JS SDK has no native `OllamaModel`. Ollama support is achieved via `OpenAIModel` with a custom `baseURL` pointing to Ollama's OpenAI-compatible API (`http://host:11434/v1`).

## Technical Context

**Language/Version**: TypeScript 5.7+ (agent), Rust 2021 edition (Tauri shell), React 18+ (frontend)  
**Primary Dependencies**: `@strands-agents/sdk ^1.0.0-rc.3`, `tauri-plugin-stronghold 2.x`, `zod ^4.1`  
**Storage**: `~/.tendril/config.json` (settings), Tauri Stronghold vault (API keys)  
**Testing**: vitest (agent), cargo test (Tauri), React component tests  
**Target Platform**: macOS desktop (primary), Linux/Windows (secondary)  
**Project Type**: Desktop app (Tauri + React + Node.js agent sidecar)  
**Performance Goals**: Provider switch in UI < 100ms, agent restart < 5s  
**Constraints**: Backward-compatible with existing Bedrock-only configs  
**Scale/Scope**: Single user, single provider active at a time, 4 providers total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Async-First | ✅ PASS | Stronghold operations are async. Agent spawn remains async. No new blocking calls. |
| II. Event-Driven State | ✅ PASS | Settings save → `restart_agent` → agent reconnect events. No polling added. |
| III. Component Isolation | ✅ PASS | Settings panel receives config via props/context. Stronghold calls go through Tauri invoke (hook layer), not direct imports. |
| IV. Protocol Compliance | ✅ PASS | No ACP protocol changes. Agent still uses initialize → new_session → prompt sequence. |
| V. Sandboxed Execution | ✅ PASS | No sandbox changes. Deno permissions unchanged. |
| VI. Test-First | ✅ PASS | Config migration, model factory, and Stronghold commands all require tests before implementation. |
| VII. Simplicity | ⚠️ JUSTIFIED | Multi-provider is explicitly expanding beyond "single provider" constraint. See Complexity Tracking. |

### Post-Design Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| VII. Simplicity | ✅ PASS | Constitution amended to v2.1.0. Ollama via OpenAI-compat avoids a custom model class. Nested config is the simplest discriminated union approach. Stronghold adds complexity but is the user's explicit security requirement. |

## Project Structure

### Documentation (this feature)

```text
specs/004-multi-provider-support/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── tauri-commands.md
│   └── agent-config-schema.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
tendril-agent/
├── src/
│   ├── config.ts        # MODIFY: Nested provider schema, legacy migration
│   ├── agent.ts         # MODIFY: Model factory replacing hardcoded BedrockModel
│   ├── types.ts         # MODIFY: Updated ModelConfig interface
│   ├── index.ts         # MODIFY: Provider-aware cost calc, startup log
│   └── ...              # Unchanged: tools/, prompt.ts, protocol.ts, registry.ts, sandbox.ts
└── tests/
    └── ...              # ADD: Config migration, model factory, validation tests

tendril-ui/
├── src-tauri/
│   ├── Cargo.toml       # MODIFY: Add tauri-plugin-stronghold
│   ├── src/
│   │   ├── lib.rs       # MODIFY: Stronghold init, credential commands, config validation
│   │   └── acp.rs       # MODIFY: Env var injection on agent spawn
│   └── capabilities/
│       └── default.json # MODIFY: Add stronghold permissions
├── src/
│   ├── components/
│   │   └── SettingsPanel.tsx  # MODIFY: Provider selector, dynamic fields, API key input
│   └── types.ts         # MODIFY: Updated AppConfig interface
└── package.json         # MODIFY: Add @tauri-apps/plugin-stronghold
```

**Structure Decision**: No new directories or projects. Changes are scoped to existing files with minimal additions (Stronghold plugin wiring, credential Tauri commands). Agent structure unchanged — `agent.ts` gains a factory function, `config.ts` gains schema refactoring.

## Complexity Tracking

> Constitution VII violation justifications

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Multi-provider support (expanding beyond single-provider constraint) | User's explicit feature request. Ollama for local models is the primary driver. | Single Bedrock provider cannot serve users without AWS accounts or wanting local inference. |
| Tauri Stronghold for credential storage | User's explicit security requirement during clarification. API keys in plaintext config is a security risk. | Plaintext in config.json was the simpler alternative; rejected because user explicitly requested secure storage. |
| Nested config schema | Required to store multiple provider configs simultaneously (retain-per-provider UX decision). | Flat schema with provider prefix was considered but rejected as more verbose and less maintainable. |
