import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';

/** Zod schema for workspace config — single source of truth for defaults and validation. */
const WorkspaceConfigSchema = z.object({
  model: z.object({
    provider: z.string().default('bedrock'),
    modelId: z.string().min(1, 'model.modelId is required').default('us.anthropic.claude-sonnet-4-5-20250514'),
    region: z.string().min(1, 'model.region is required').default('us-east-1'),
    profile: z.string().optional(),
  }).default({ provider: 'bedrock', modelId: 'us.anthropic.claude-sonnet-4-5-20250514', region: 'us-east-1' }),
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

  const workspace = workspaceOverride
    ?? (raw.workspace as string | undefined)
    ?? path.join(os.homedir(), 'tendril-workspace');

  const config = WorkspaceConfigSchema.parse(raw);

  return { config, workspace };
}
