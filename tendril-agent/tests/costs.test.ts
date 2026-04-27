import { describe, it, expect } from 'vitest';
import { PROVIDER_COSTS, getActiveModelId } from '../src/costs';
import type { WorkspaceConfig } from '../src/config';

describe('PROVIDER_COSTS', () => {
  it('has cost entries for all 4 providers', () => {
    expect(PROVIDER_COSTS).toHaveProperty('bedrock');
    expect(PROVIDER_COSTS).toHaveProperty('ollama');
    expect(PROVIDER_COSTS).toHaveProperty('openai');
    expect(PROVIDER_COSTS).toHaveProperty('anthropic');
  });

  it('bedrock has correct costs', () => {
    expect(PROVIDER_COSTS.bedrock.inputCostPerToken).toBe(0.000003);
    expect(PROVIDER_COSTS.bedrock.outputCostPerToken).toBe(0.000015);
    expect(PROVIDER_COSTS.bedrock.contextLimit).toBe(200_000);
  });

  it('openai has correct costs', () => {
    expect(PROVIDER_COSTS.openai.inputCostPerToken).toBe(0.0000025);
    expect(PROVIDER_COSTS.openai.outputCostPerToken).toBe(0.00001);
    expect(PROVIDER_COSTS.openai.contextLimit).toBe(128_000);
  });

  it('anthropic has correct costs', () => {
    expect(PROVIDER_COSTS.anthropic.inputCostPerToken).toBe(0.000003);
    expect(PROVIDER_COSTS.anthropic.outputCostPerToken).toBe(0.000015);
    expect(PROVIDER_COSTS.anthropic.contextLimit).toBe(200_000);
  });

  it('ollama has zero cost', () => {
    expect(PROVIDER_COSTS.ollama.inputCostPerToken).toBe(0);
    expect(PROVIDER_COSTS.ollama.outputCostPerToken).toBe(0);
  });
});

function makeConfig(model: WorkspaceConfig['model']): WorkspaceConfig {
  return {
    model,
    sandbox: { denoPath: 'deno', timeoutMs: 45000, allowedDomains: [] },
    registry: { maxCapabilities: 500 },
    agent: { maxTurns: 100 },
  };
}

describe('getActiveModelId', () => {
  it('returns bedrock modelId', () => {
    const config = makeConfig({
      provider: 'bedrock',
      bedrock: { modelId: 'us.anthropic.claude-sonnet-4-5-20250514', region: 'us-east-1' },
    });
    expect(getActiveModelId(config)).toBe('us.anthropic.claude-sonnet-4-5-20250514');
  });

  it('returns ollama modelId', () => {
    const config = makeConfig({
      provider: 'ollama',
      ollama: { host: 'http://localhost:11434', modelId: 'llama3' },
    });
    expect(getActiveModelId(config)).toBe('llama3');
  });

  it('returns openai modelId', () => {
    const config = makeConfig({
      provider: 'openai',
      openai: { modelId: 'gpt-4o' },
    });
    expect(getActiveModelId(config)).toBe('gpt-4o');
  });

  it('returns anthropic modelId', () => {
    const config = makeConfig({
      provider: 'anthropic',
      anthropic: { modelId: 'claude-sonnet-4-20250514' },
    });
    expect(getActiveModelId(config)).toBe('claude-sonnet-4-20250514');
  });

  it('returns unknown when provider config block is missing', () => {
    const config = makeConfig({ provider: 'bedrock' });
    expect(getActiveModelId(config)).toBe('unknown');
  });
});
