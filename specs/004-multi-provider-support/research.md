# Research: Multi-Provider Model Support

**Date**: 2026-04-16  
**Spec**: [spec.md](./spec.md)

## R-001: Strands JS SDK Available Model Providers

**Decision**: The `@strands-agents/sdk` (Node.js/TypeScript) bundles these model providers at `dist/src/models/`:
- `bedrock.js` — `BedrockModel` (current default)
- `openai.js` — `OpenAIModel` with `clientConfig` support
- `anthropic.js` — `AnthropicModel` with `apiKey` support
- `google/` — Google Gemini model
- `vercel.js` — Vercel AI SDK adapter

**Critical finding**: Unlike the Python SDK, the JS SDK does **not** include an `OllamaModel` class. Ollama support must be achieved via the `OpenAIModel` with a custom `baseURL`, since Ollama exposes an OpenAI-compatible API at `http://localhost:11434/v1`.

**Rationale**: Ollama's OpenAI compatibility API is a first-class feature documented at ollama.ai. The `OpenAIModel` constructor accepts `clientConfig: ClientOptions` (from the `openai` npm package), which includes `baseURL`. Setting `baseURL` to the Ollama endpoint and `apiKey` to a dummy value (Ollama doesn't require auth) provides full Ollama support without a custom model class.

**Alternatives considered**:
- Write a custom `OllamaModel` class implementing the Strands `Model` interface → rejected (unnecessary complexity; OpenAI-compat is simpler and maintained by Strands)
- Use the Python SDK for Ollama → rejected (agent is TypeScript)
- Wait for Strands JS SDK to add native Ollama → rejected (no timeline; OpenAI-compat works now)

## R-002: OpenAI Model — API Key and Client Configuration

**Decision**: `OpenAIModel` reads API key from `process.env.OPENAI_API_KEY` by default, or accepts `apiKey` in constructor options. It also accepts a `clientConfig: ClientOptions` for custom `baseURL`, timeout, etc.

**Rationale**: This confirms the env-var injection pattern from clarifications works directly. Tauri reads from Stronghold, sets `OPENAI_API_KEY` env var on child process, `OpenAIModel` picks it up automatically.

**Import path**: `import { OpenAIModel } from '@strands-agents/sdk/models/openai'`

## R-003: Anthropic Model — API Key Configuration

**Decision**: `AnthropicModel` reads API key from `process.env.ANTHROPIC_API_KEY` by default, or accepts `apiKey` in constructor. Import from `@strands-agents/sdk/models/anthropic`.

**Rationale**: Same env-var pattern as OpenAI. No additional configuration needed.

## R-004: Ollama via OpenAI-Compatible API

**Decision**: Implement Ollama support by instantiating `OpenAIModel` with:
```typescript
new OpenAIModel({
  api: 'chat',
  modelId: 'llama3',
  apiKey: 'ollama',  // Ollama ignores auth; dummy value satisfies SDK validation
  clientConfig: { baseURL: 'http://localhost:11434/v1' }
})
```

**Rationale**: Ollama serves an OpenAI-compatible Chat Completions API at `/v1`. The `openai` npm package (which `OpenAIModel` wraps) supports `baseURL` in `ClientOptions`. This requires zero custom model code.

**Alternatives considered**:
- Custom `Model` subclass using `ollama` npm package → rejected (adds dependency, more code)
- `fetch`-based custom implementation → rejected (reimplements streaming, tool use, etc.)

## R-005: Tauri Stronghold Plugin

**Decision**: Use `tauri-plugin-stronghold` for encrypted API key storage. Vault protected with argon2 password hash. Salt stored in app local data dir.

**Rationale**: First-party Tauri plugin. Cross-platform. Password-protected vault means keys are encrypted at rest. No plaintext API keys in config.json.

**Implementation approach**:
- Add `tauri-plugin-stronghold` to Cargo.toml and npm dependencies
- Initialize with `Builder::with_argon2(&salt_path)` in Tauri setup
- Rust backend provides `save_api_key` and `get_api_key` Tauri commands
- At agent spawn, read keys from Stronghold and inject as env vars on child process
- UI calls `save_api_key` Tauri command when user enters a key (never sends key to config.json)

**Vault password UX**: For v1, use a fixed application-derived key (e.g., machine-specific identifier) rather than prompting the user for a vault password. This provides encryption at rest without UX friction. A user-prompted vault password can be added later as a security enhancement.

**Alternatives considered**:
- OS Keychain via `keyring` crate → rejected (no official Tauri plugin, platform-specific backends)
- Plaintext in config.json → rejected (user explicitly requested secure storage)

## R-006: Config Schema — Nested Provider Blocks with Backward Compatibility

**Decision**: Refactored `model` section structure:
```json
{
  "model": {
    "provider": "bedrock",
    "bedrock": { "modelId": "...", "region": "us-east-1", "profile": "default" },
    "ollama": { "host": "http://localhost:11434", "modelId": "llama3" },
    "openai": { "modelId": "gpt-4o" },
    "anthropic": { "modelId": "claude-sonnet-4-20250514" }
  }
}
```

**Backward compatibility**: If `model.provider` is absent but `model.modelId` and `model.region` exist, treat as legacy Bedrock config. Migrate in-memory (or lazily on next save) to nested format.

**Rationale**: All provider configs coexist. Switching providers in settings only changes `model.provider`. No data loss on provider switch.

## R-007: Strands SDK Streaming Event Shape Consistency

**Decision**: All Strands JS SDK model providers emit the same `ModelStreamEvent` types (`modelContentBlockDeltaEvent`, `modelMetadataEvent`, `modelMessageStopEvent`, etc.) because they all implement the same `Model.stream()` interface. The existing stream event handler in `index.ts` should work across providers without modification.

**Rationale**: The SDK normalizes provider-specific responses into a common event stream. Verified by checking that `OpenAIModel`, `AnthropicModel`, and `BedrockModel` all return `AsyncIterable<ModelStreamEvent>`.

**Risk**: Minor differences in metadata fields (e.g., usage token counts) may exist. The existing handler already has null-safe access (`usage.inputTokens ?? 0`).

## R-008: Cost Calculation by Provider

**Decision**: Maintain a provider-aware cost lookup table. For providers without known pricing (Ollama), report zero cost. For OpenAI and Anthropic, use approximate per-token pricing. The table is a static map in `index.ts`, not fetched from an API.

**Rationale**: Cost reporting is informational, not billing-critical. Static approximations are sufficient. Users running local models (Ollama) have zero API cost by definition.
