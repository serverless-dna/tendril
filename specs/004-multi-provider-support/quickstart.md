# Quickstart: Multi-Provider Model Support

**Date**: 2026-04-16

## Overview

This feature refactors the tendril-agent and tendril-ui to support multiple model providers (Bedrock, Ollama, OpenAI, Anthropic) with a dynamic settings UI and secure API key storage via Tauri Stronghold.

## Prerequisites

- Node.js 22+
- Rust toolchain (for Tauri)
- Existing tendril workspace at `~/.tendril/`
- For Ollama testing: Ollama installed and running with a model pulled

## Key Files to Modify

### tendril-agent (TypeScript)

| File | Change |
|------|--------|
| `src/config.ts` | Refactor Zod schema to nested provider blocks; add legacy migration |
| `src/agent.ts` | Replace hardcoded `BedrockModel` with model factory function |
| `src/types.ts` | Update `ModelConfig` interface to match new schema |
| `src/index.ts` | Provider-aware cost calculation; update startup log |
| `tests/` | Tests for config migration, model factory, provider validation |

### tendril-ui (Tauri + React)

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-stronghold` dependency |
| `src-tauri/src/lib.rs` | Add Stronghold init, `save_api_key`, `has_api_key`, `delete_api_key` commands; env var injection in agent spawn |
| `src-tauri/src/acp.rs` | Read provider config, inject env vars when spawning sidecar |
| `src/components/SettingsPanel.tsx` | Provider selector dropdown, dynamic form fields, API key input, save validation |
| `src/types.ts` | Update `AppConfig` to match new schema |

## Development Sequence

1. **Agent config refactor** — Update `config.ts` Zod schema and `types.ts`. Add legacy migration. Write tests.
2. **Model factory** — Create `createModel()` factory in `agent.ts`. Import OpenAI/Anthropic models. Write tests.
3. **Agent startup** — Update `index.ts` for provider-aware logging and cost calculation.
4. **Stronghold integration** — Add plugin to Tauri. Implement `save_api_key`/`has_api_key`/`delete_api_key` commands.
5. **Env var injection** — Modify `acp.rs` to read Stronghold keys and inject as env vars on sidecar spawn.
6. **Settings UI** — Provider dropdown, dynamic fields, API key masked input, save validation.
7. **Integration testing** — End-to-end: switch provider in UI → agent restarts with correct model.

## Quick Smoke Test

### Bedrock (existing — should still work)
```json
{ "model": { "provider": "bedrock", "bedrock": { "modelId": "us.anthropic.claude-sonnet-4-5-20250514", "region": "us-east-1" } } }
```

### Ollama
```json
{ "model": { "provider": "ollama", "ollama": { "host": "http://localhost:11434", "modelId": "llama3" } } }
```

### OpenAI (with env var)
```bash
export OPENAI_API_KEY=sk-...
```
```json
{ "model": { "provider": "openai", "openai": { "modelId": "gpt-4o" } } }
```

### Legacy config (backward compat)
```json
{ "model": { "modelId": "us.anthropic.claude-sonnet-4-5-20250514", "region": "us-east-1" } }
```
→ Auto-migrates to nested Bedrock format on load.
