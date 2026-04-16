# Data Model: Multi-Provider Model Support

**Date**: 2026-04-16  
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## Config Schema (config.json)

### Current Schema (v1 — Bedrock-only)

```json
{
  "workspace": "/path/to/workspace",
  "model": {
    "provider": "bedrock",
    "modelId": "us.anthropic.claude-sonnet-4-5-20250514",
    "region": "us-east-1",
    "profile": "default"
  },
  "sandbox": { "denoPath": "deno", "timeoutMs": 45000, "allowedDomains": [] },
  "registry": { "maxCapabilities": 500 },
  "agent": { "maxTurns": 100 }
}
```

### New Schema (v2 — Multi-provider)

```json
{
  "workspace": "/path/to/workspace",
  "model": {
    "provider": "bedrock",
    "bedrock": {
      "modelId": "us.anthropic.claude-sonnet-4-5-20250514",
      "region": "us-east-1",
      "profile": "default"
    },
    "ollama": {
      "host": "http://localhost:11434",
      "modelId": "llama3"
    },
    "openai": {
      "modelId": "gpt-4o"
    },
    "anthropic": {
      "modelId": "claude-sonnet-4-20250514"
    }
  },
  "sandbox": { "denoPath": "deno", "timeoutMs": 45000, "allowedDomains": [] },
  "registry": { "maxCapabilities": 500 },
  "agent": { "maxTurns": 100 }
}
```

### Backward Compatibility (Legacy Detection)

If `model.provider` is absent but `model.modelId` and `model.region` are present, the config is legacy format. On load:
1. Set `provider` to `"bedrock"`
2. Move `modelId`, `region`, `profile` into `model.bedrock`
3. Remove flat fields from `model`
4. Continue with new schema in memory

On next save, the new format is persisted.

## Entity Definitions

### Provider (enum)

```
"bedrock" | "ollama" | "openai" | "anthropic"
```

### BedrockConfig

| Field | Type | Required | Default |
|-------|------|----------|---------|
| modelId | string | yes | `us.anthropic.claude-sonnet-4-5-20250514` |
| region | string | yes | `us-east-1` |
| profile | string | no | — |

### OllamaConfig

| Field | Type | Required | Default |
|-------|------|----------|---------|
| host | string (URL) | yes | `http://localhost:11434` |
| modelId | string | yes | `llama3` |

### OpenAIConfig

| Field | Type | Required | Default |
|-------|------|----------|---------|
| modelId | string | yes | `gpt-4o` |

API key stored in Stronghold, NOT in config. Retrieved via env var `OPENAI_API_KEY`.

### AnthropicConfig

| Field | Type | Required | Default |
|-------|------|----------|---------|
| modelId | string | yes | `claude-sonnet-4-20250514` |

API key stored in Stronghold, NOT in config. Retrieved via env var `ANTHROPIC_API_KEY`.

### SecureCredentialStore (Stronghold)

| Key | Provider | Env Var Injected |
|-----|----------|------------------|
| `openai_api_key` | openai | `OPENAI_API_KEY` |
| `anthropic_api_key` | anthropic | `ANTHROPIC_API_KEY` |

Vault location: `{app_local_data_dir}/vault.hold`  
Salt location: `{app_local_data_dir}/salt.txt`  
Encryption: argon2 password hash with application-derived key

### ModelConfig (top-level)

| Field | Type | Required | Default |
|-------|------|----------|---------|
| provider | Provider | yes | `bedrock` |
| bedrock | BedrockConfig | no | defaults applied if provider=bedrock |
| ollama | OllamaConfig | no | defaults applied if provider=ollama |
| openai | OpenAIConfig | no | — |
| anthropic | AnthropicConfig | no | — |

Only the block matching `provider` is validated at config load time. Other blocks may be present (retained for switch-back) but are not validated.

## Cost Lookup Table

| Provider | Input ($/token) | Output ($/token) | Context Limit |
|----------|-----------------|-------------------|---------------|
| bedrock (Claude Sonnet 4.5) | 0.000003 | 0.000015 | 200,000 |
| openai (GPT-4o) | 0.0000025 | 0.00001 | 128,000 |
| anthropic (Claude Sonnet 4) | 0.000003 | 0.000015 | 200,000 |
| ollama (local) | 0 | 0 | model-dependent |

Static lookup keyed by provider. Updated manually when pricing changes. Context limits are approximate defaults; can be overridden per model in future.

## State Transitions

```
[No Config] → readConfig() → [Legacy Detected] → migrate() → [New Schema in Memory]
[No Config] → readConfig() → [New Schema] → validate(active provider) → [Ready]
[Ready] → user changes provider in UI → save → [New Schema on Disk] → restart agent → [Ready]
```

## Validation Rules

1. `model.provider` MUST be one of the defined Provider enum values
2. The provider-specific block for the active provider MUST exist and have all required fields
3. Inactive provider blocks are NOT validated (may be incomplete or missing)
4. For `openai` and `anthropic` providers, the UI MUST verify a Stronghold key exists before allowing save
5. `ollama.host` MUST be a valid URL (scheme + host)
6. String fields MUST be non-empty when required
