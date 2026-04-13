import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { WorkspaceConfig } from './types.js';

const DEFAULTS: WorkspaceConfig = {
  model: {
    provider: 'bedrock',
    modelId: 'us.anthropic.claude-sonnet-4-5-20250514',
    region: 'us-east-1',
    profile: undefined,
  },
  sandbox: {
    denoPath: 'deno',
    timeoutMs: 45000,
    allowedDomains: [],
  },
  registry: {
    maxCapabilities: 500,
  },
  agent: {
    maxTurns: 100,
  },
};

/** App config path: ~/.tendril/config.json */
function appConfigPath(): string {
  return path.join(os.homedir(), '.tendril', 'config.json');
}

/**
 * Read config from ~/.tendril/config.json.
 * Returns the config and the workspace path.
 */
export function readConfig(workspaceOverride?: string): { config: WorkspaceConfig; workspace: string } {
  const configPath = appConfigPath();

  let raw: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (err) {
      throw new Error(`Failed to parse config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const workspace = workspaceOverride
    ?? (raw.workspace as string | undefined)
    ?? path.join(os.homedir(), 'tendril-workspace');

  const config: WorkspaceConfig = {
    model: {
      provider: (raw.model as Record<string, unknown>)?.provider as string ?? DEFAULTS.model.provider,
      modelId: (raw.model as Record<string, unknown>)?.modelId as string ?? DEFAULTS.model.modelId,
      region: (raw.model as Record<string, unknown>)?.region as string ?? DEFAULTS.model.region,
      profile: (raw.model as Record<string, unknown>)?.profile as string | undefined ?? DEFAULTS.model.profile,
    },
    sandbox: {
      denoPath: (raw.sandbox as Record<string, unknown>)?.denoPath as string ?? DEFAULTS.sandbox.denoPath,
      timeoutMs: (raw.sandbox as Record<string, unknown>)?.timeoutMs as number ?? DEFAULTS.sandbox.timeoutMs,
      allowedDomains: (raw.sandbox as Record<string, unknown>)?.allowedDomains as string[] ?? DEFAULTS.sandbox.allowedDomains,
    },
    registry: {
      maxCapabilities: (raw.registry as Record<string, unknown>)?.maxCapabilities as number ?? DEFAULTS.registry.maxCapabilities,
    },
    agent: {
      maxTurns: (raw.agent as Record<string, unknown>)?.maxTurns as number ?? DEFAULTS.agent.maxTurns,
    },
  };

  if (!config.model.modelId) {
    throw new Error('Config validation failed: model.modelId is required');
  }
  if (!config.model.region) {
    throw new Error('Config validation failed: model.region is required');
  }

  return { config, workspace };
}
