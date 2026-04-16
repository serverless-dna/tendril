import { describe, it, expect, vi, afterEach } from 'vitest';
import type { WorkspaceConfig } from '../src/config';

// Mock the SDK models before importing agent.ts
vi.mock('@strands-agents/sdk/models/bedrock', () => ({
  BedrockModel: vi.fn().mockImplementation((opts: unknown) => ({ _type: 'BedrockModel', opts })),
}));

vi.mock('@strands-agents/sdk/models/openai', () => ({
  OpenAIModel: vi.fn().mockImplementation((opts: unknown) => ({ _type: 'OpenAIModel', opts })),
}));

vi.mock('@strands-agents/sdk/models/anthropic', () => ({
  AnthropicModel: vi.fn().mockImplementation((opts: unknown) => ({ _type: 'AnthropicModel', opts })),
}));

import { createModel } from '../src/agent';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { OpenAIModel } from '@strands-agents/sdk/models/openai';
import { AnthropicModel } from '@strands-agents/sdk/models/anthropic';

afterEach(() => {
  vi.clearAllMocks();
});

function makeConfig(model: WorkspaceConfig['model']): WorkspaceConfig {
  return {
    model,
    sandbox: { denoPath: 'deno', timeoutMs: 45000, allowedDomains: [] },
    registry: { maxCapabilities: 500 },
    agent: { maxTurns: 100 },
  };
}

describe('createModel', () => {
  it('instantiates BedrockModel for bedrock provider', () => {
    const config = makeConfig({
      provider: 'bedrock',
      bedrock: { modelId: 'us.anthropic.claude-sonnet-4-5-20250514', region: 'us-east-1' },
    });

    const { model, provider } = createModel(config);
    expect(provider).toBe('bedrock');
    expect(BedrockModel).toHaveBeenCalledWith({
      modelId: 'us.anthropic.claude-sonnet-4-5-20250514',
      region: 'us-east-1',
    });
    expect((model as Record<string, unknown>)._type).toBe('BedrockModel');
  });

  it('instantiates OpenAIModel with custom baseURL for ollama provider', () => {
    const config = makeConfig({
      provider: 'ollama',
      ollama: { host: 'http://localhost:11434', modelId: 'llama3' },
    });

    const { model, provider } = createModel(config);
    expect(provider).toBe('ollama');
    expect(OpenAIModel).toHaveBeenCalledWith({
      api: 'chat',
      modelId: 'llama3',
      apiKey: 'ollama',
      clientConfig: { baseURL: 'http://localhost:11434/v1' },
    });
    expect((model as Record<string, unknown>)._type).toBe('OpenAIModel');
  });

  it('strips trailing slash from Ollama host before appending /v1', () => {
    const config = makeConfig({
      provider: 'ollama',
      ollama: { host: 'http://localhost:11434/', modelId: 'codellama' },
    });

    createModel(config);
    expect(OpenAIModel).toHaveBeenCalledWith(
      expect.objectContaining({
        clientConfig: { baseURL: 'http://localhost:11434/v1' },
      }),
    );
  });

  it('instantiates OpenAIModel for openai provider', () => {
    const config = makeConfig({
      provider: 'openai',
      openai: { modelId: 'gpt-4o' },
    });

    const { model, provider } = createModel(config);
    expect(provider).toBe('openai');
    expect(OpenAIModel).toHaveBeenCalledWith({
      api: 'chat',
      modelId: 'gpt-4o',
    });
    expect((model as Record<string, unknown>)._type).toBe('OpenAIModel');
  });

  it('instantiates AnthropicModel for anthropic provider', () => {
    const config = makeConfig({
      provider: 'anthropic',
      anthropic: { modelId: 'claude-sonnet-4-20250514' },
    });

    const { model, provider } = createModel(config);
    expect(provider).toBe('anthropic');
    expect(AnthropicModel).toHaveBeenCalledWith({
      modelId: 'claude-sonnet-4-20250514',
    });
    expect((model as Record<string, unknown>)._type).toBe('AnthropicModel');
  });

  it('throws for missing bedrock config block', () => {
    const config = makeConfig({ provider: 'bedrock' });
    expect(() => createModel(config)).toThrow('bedrock config block is required');
  });

  it('throws for missing ollama config block', () => {
    const config = makeConfig({ provider: 'ollama' });
    expect(() => createModel(config)).toThrow('ollama config block is required');
  });

  it('throws for missing openai config block', () => {
    const config = makeConfig({ provider: 'openai' });
    expect(() => createModel(config)).toThrow('openai config block is required');
  });

  it('throws for missing anthropic config block', () => {
    const config = makeConfig({ provider: 'anthropic' });
    expect(() => createModel(config)).toThrow('anthropic config block is required');
  });

  it('sets AWS_PROFILE when bedrock profile is provided', () => {
    const config = makeConfig({
      provider: 'bedrock',
      bedrock: { modelId: 'test', region: 'us-east-1', profile: 'myprofile' },
    });

    createModel(config);
    expect(process.env.AWS_PROFILE).toBe('myprofile');
  });
});
