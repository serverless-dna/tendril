import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import type { Provider } from './types.js';

// === Provider Enum ===
export const ProviderEnum = z.enum(['bedrock', 'ollama', 'openai', 'anthropic']);

// === Per-Provider Schemas ===
const BedrockConfigSchema = z.object({
  modelId: z.string().min(1, 'bedrock.modelId is required'),
  region: z.string().min(1, 'bedrock.region is required'),
  profile: z.string().optional(),
});

const OllamaConfigSchema = z.object({
  host: z.string().url('ollama.host must be a valid URL'),
  modelId: z.string().min(1, 'ollama.modelId is required'),
});

const OpenAIConfigSchema = z.object({
  modelId: z.string().min(1, 'openai.modelId is required'),
});

const AnthropicConfigSchema = z.object({
  modelId: z.string().min(1, 'anthropic.modelId is required'),
});

// === Model Config Schema ===
const ModelConfigSchema = z.object({
  provider: ProviderEnum.default('bedrock'),
  bedrock: BedrockConfigSchema.optional(),
  ollama: OllamaConfigSchema.optional(),
  openai: OpenAIConfigSchema.optional(),
  anthropic: AnthropicConfigSchema.optional(),
}).superRefine((data, ctx) => {
  // Validate that the active provider's config block exists and is valid
  const provider = data.provider;
  if (provider === 'bedrock' && !data.bedrock) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'bedrock config block is required when provider is bedrock',
      path: ['bedrock'],
    });
  }
  if (provider === 'ollama' && !data.ollama) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ollama config block is required when provider is ollama',
      path: ['ollama'],
    });
  }
  if (provider === 'openai' && !data.openai) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'openai config block is required when provider is openai',
      path: ['openai'],
    });
  }
  if (provider === 'anthropic' && !data.anthropic) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'anthropic config block is required when provider is anthropic',
      path: ['anthropic'],
    });
  }
});

/** Zod schema for workspace config — single source of truth for defaults and validation. */
const WorkspaceConfigSchema = z.object({
  model: ModelConfigSchema.default({
    provider: 'bedrock',
    bedrock: {
      modelId: 'us.anthropic.claude-sonnet-4-5-20250514',
      region: 'us-east-1',
    },
  }),
  sandbox: z.object({
    denoPath: z.string().default('deno'),
    timeoutMs: z.number().positive().int().default(45000),
    allowedDomains: z.array(z.string()).default([]),
  }).default({ denoPath: 'deno', timeoutMs: 45000, allowedDomains: [] }),
  registry: z.object({
    maxCapabilities: z.number().positive().int().default(500),
  }).default({ maxCapabilities: 500 }),
  agent: z.object({
    maxTurns: z.number().positive().int().default(100),
  }).default({ maxTurns: 100 }),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

/**
 * Migrate legacy flat config format to nested provider blocks.
 * Detects: { model: { modelId: "...", region: "...", profile?: "..." } }
 * without model.provider or model.bedrock, and migrates to:
 * { model: { provider: "bedrock", bedrock: { modelId, region, profile } } }
 */
export function migrateLegacyConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const model = raw.model as Record<string, unknown> | undefined;
  if (!model) return raw;

  // Already migrated: has provider AND a nested block
  if (model.provider && (model.bedrock || model.ollama || model.openai || model.anthropic)) {
    return raw;
  }

  // Legacy detection: flat modelId + region without nested blocks
  const hasFlat = typeof model.modelId === 'string' && typeof model.region === 'string';
  const hasNested = model.bedrock || model.ollama || model.openai || model.anthropic;

  if (hasFlat && !hasNested) {
    const bedrock: Record<string, unknown> = {
      modelId: model.modelId,
      region: model.region,
    };
    if (model.profile) {
      bedrock.profile = model.profile;
    }

    const migratedModel: Record<string, unknown> = {
      provider: model.provider ?? 'bedrock',
      bedrock,
    };

    // Preserve any other provider blocks that might exist
    for (const key of Object.keys(model)) {
      if (!['provider', 'modelId', 'region', 'profile', 'bedrock', 'ollama', 'openai', 'anthropic'].includes(key)) {
        migratedModel[key] = model[key];
      }
    }

    return { ...raw, model: migratedModel };
  }

  return raw;
}

/** App config path: ~/.tendril/config.json (or overridden for testing) */
function appConfigPath(configDirOverride?: string): string {
  const base = configDirOverride ?? os.homedir();
  return path.join(base, '.tendril', 'config.json');
}

/**
 * Read config from ~/.tendril/config.json (or configDirOverride/.tendril/config.json).
 * Returns the config and the workspace path.
 */
export async function readConfig(workspaceOverride?: string, configDirOverride?: string): Promise<{ config: WorkspaceConfig; workspace: string }> {
  const configPath = appConfigPath(configDirOverride);

  let raw: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    raw = JSON.parse(content);
  } catch (err: unknown) {
    // File not found — use defaults
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      // No config file — defaults will be applied by zod
    } else if (err instanceof SyntaxError) {
      throw new Error(`Failed to parse config at ${configPath}: ${err.message}`);
    } else {
      throw new Error(`Failed to read config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Apply legacy migration before validation
  raw = migrateLegacyConfig(raw);

  const workspace = workspaceOverride
    ?? (raw.workspace as string | undefined)
    ?? path.join(os.homedir(), 'tendril-workspace');

  const config = WorkspaceConfigSchema.parse(raw);

  return { config, workspace };
}
