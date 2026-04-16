# Contracts: Multi-Provider Model Support

**Date**: 2026-04-16

## Tauri Commands (Rust → Frontend)

### `save_api_key`

Stores an API key in the Stronghold vault.

**Invoke**: `invoke('save_api_key', { provider, apiKey })`

| Param | Type | Description |
|-------|------|-------------|
| provider | `"openai" \| "anthropic"` | Provider identifier (vault key prefix) |
| apiKey | `string` | The raw API key value |

**Returns**: `Result<(), String>`

**Behaviour**:
- Opens Stronghold vault (auto-initializes if first use)
- Stores key under `{provider}_api_key`
- Saves vault to disk
- Never logs the key value

### `has_api_key`

Checks whether an API key exists in the Stronghold vault for a given provider.

**Invoke**: `invoke('has_api_key', { provider })`

| Param | Type | Description |
|-------|------|-------------|
| provider | `"openai" \| "anthropic"` | Provider identifier |

**Returns**: `Result<bool, String>`

**Behaviour**:
- Returns `true` if a non-empty key exists for `{provider}_api_key`
- Does NOT return the key value
- Used by settings panel to determine save-readiness

### `delete_api_key`

Removes an API key from the Stronghold vault.

**Invoke**: `invoke('delete_api_key', { provider })`

| Param | Type | Description |
|-------|------|-------------|
| provider | `"openai" \| "anthropic"` | Provider identifier |

**Returns**: `Result<(), String>`

## Agent Spawn (Rust → Child Process)

### Environment Variable Injection

When spawning the `tendril-agent` sidecar, the Tauri backend reads the active provider from config and, if the provider requires an API key, reads the key from Stronghold and sets it as an environment variable on the child process.

| Provider | Env Var | Source |
|----------|---------|--------|
| openai | `OPENAI_API_KEY` | Stronghold `openai_api_key` |
| anthropic | `ANTHROPIC_API_KEY` | Stronghold `anthropic_api_key` |
| bedrock | (none — uses AWS credential chain) | — |
| ollama | (none — no auth) | — |

**Precedence**: If the env var is already set in the parent process environment, the Stronghold value is NOT injected (env var takes precedence).

## Config File Contract (config.json)

See [data-model.md](../data-model.md) for the full schema. Key contract points:

- `model.provider` is the discriminant field
- Provider blocks (`model.bedrock`, `model.ollama`, etc.) coexist
- Only the active provider's block is validated
- Legacy flat format (`model.modelId`, `model.region` without `model.provider`) is auto-migrated

## Settings Panel → Tauri Backend

### Save Flow

1. Frontend reads form values for ALL providers
2. Frontend calls `has_api_key(provider)` for the active provider (if it requires a key)
3. If key missing AND user entered a new key → call `save_api_key(provider, apiKey)`
4. Frontend calls `write_config(config)` with the full config (API keys NOT included in config)
5. Frontend calls `restart_agent()`

### API Key Entry UX

- API key input is `type="password"`
- If a key already exists in Stronghold, show placeholder `"••••••••"` (never reveal the key)
- User can clear and re-enter a key (calls `save_api_key` on save)
- User can delete a key (calls `delete_api_key`)
