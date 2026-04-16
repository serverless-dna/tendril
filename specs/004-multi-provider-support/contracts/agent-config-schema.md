# Contracts: Agent Config Schema (Zod)

**Date**: 2026-04-16

## tendril-agent config.ts Zod Schema

The agent's `WorkspaceConfigSchema` must be refactored from flat `model` fields to nested provider blocks.

### New Schema Shape

```typescript
const ProviderEnum = z.enum(['bedrock', 'ollama', 'openai', 'anthropic']);

const BedrockConfigSchema = z.object({
  modelId: z.string().min(1).default('us.anthropic.claude-sonnet-4-5-20250514'),
  region: z.string().min(1).default('us-east-1'),
  profile: z.string().optional(),
});

const OllamaConfigSchema = z.object({
  host: z.string().url().default('http://localhost:11434'),
  modelId: z.string().min(1).default('llama3'),
});

const OpenAIConfigSchema = z.object({
  modelId: z.string().min(1).default('gpt-4o'),
});

const AnthropicConfigSchema = z.object({
  modelId: z.string().min(1).default('claude-sonnet-4-20250514'),
});

const ModelConfigSchema = z.object({
  provider: ProviderEnum.default('bedrock'),
  bedrock: BedrockConfigSchema.optional(),
  ollama: OllamaConfigSchema.optional(),
  openai: OpenAIConfigSchema.optional(),
  anthropic: AnthropicConfigSchema.optional(),
});
```

### Validation Contract

- Parse succeeds if `model.provider` is a valid enum value
- The block matching `model.provider` is validated with its schema's required fields
- Other blocks pass through without validation (may be partial/missing)
- Defaults are applied per-block

### Legacy Migration

If raw input has `model.modelId` and `model.region` but no `model.provider`:
1. Extract `modelId`, `region`, `profile` from `model`
2. Set `model.provider = 'bedrock'`
3. Set `model.bedrock = { modelId, region, profile }`
4. Delete flat fields

This migration runs in `readConfig()` before Zod parse.

## Model Factory Contract

```typescript
function createModel(config: ModelConfig): Model {
  switch (config.provider) {
    case 'bedrock':
      return new BedrockModel({ modelId, region });
    case 'ollama':
      return new OpenAIModel({
        api: 'chat',
        modelId,
        apiKey: 'ollama',
        clientConfig: { baseURL: `${host}/v1` }
      });
    case 'openai':
      return new OpenAIModel({ api: 'chat', modelId });
      // API key from process.env.OPENAI_API_KEY
    case 'anthropic':
      return new AnthropicModel({ modelId });
      // API key from process.env.ANTHROPIC_API_KEY
  }
}
```

Note: Ollama uses `OpenAIModel` with custom `baseURL` pointing to Ollama's OpenAI-compatible endpoint.
