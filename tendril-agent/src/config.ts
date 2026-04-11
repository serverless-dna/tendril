import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WorkspaceConfig } from './types.js';

const DEFAULTS: WorkspaceConfig = {
  model: {
    provider: 'bedrock',
    modelId: 'us.anthropic.claude-sonnet-4-5-20250514',
    region: 'us-east-1',
  },
  sandbox: {
    denoPath: 'deno',
    timeoutMs: 45000,
    allowedDomains: ['esm.sh', 'deno.land', 'cdn.jsdelivr.net'],
  },
  registry: {
    maxCapabilities: 500,
  },
  agent: {
    maxTurns: 100,
  },
};

export function readConfig(workspacePath: string): WorkspaceConfig {
  const configPath = path.join(workspacePath, '.tendril', 'config.json');

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULTS };
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const config: WorkspaceConfig = {
    model: {
      provider: raw.model?.provider ?? DEFAULTS.model.provider,
      modelId: raw.model?.modelId ?? DEFAULTS.model.modelId,
      region: raw.model?.region ?? DEFAULTS.model.region,
    },
    sandbox: {
      denoPath: raw.sandbox?.denoPath ?? DEFAULTS.sandbox.denoPath,
      timeoutMs: raw.sandbox?.timeoutMs ?? DEFAULTS.sandbox.timeoutMs,
      allowedDomains: raw.sandbox?.allowedDomains ?? DEFAULTS.sandbox.allowedDomains,
    },
    registry: {
      maxCapabilities: raw.registry?.maxCapabilities ?? DEFAULTS.registry.maxCapabilities,
    },
    agent: {
      maxTurns: raw.agent?.maxTurns ?? DEFAULTS.agent.maxTurns,
    },
  };

  if (!config.model.modelId) {
    throw new Error('Config validation failed: model.modelId is required');
  }
  if (!config.model.region) {
    throw new Error('Config validation failed: model.region is required');
  }

  return config;
}
