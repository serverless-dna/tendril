import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readConfig, migrateLegacyConfig } from '../src/config';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tendril-cfg-'));
  fs.mkdirSync(path.join(tmpDir, '.tendril'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readConfig', () => {
  it('reads a valid new-format config file', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: {
          provider: 'bedrock',
          bedrock: { modelId: 'test-model', region: 'eu-west-1' },
        },
        sandbox: { denoPath: '/usr/bin/deno', timeoutMs: 10000, allowedDomains: ['example.com'] },
        registry: { maxCapabilities: 200 },
        agent: { maxTurns: 50 },
      }),
    );

    const { config } = await readConfig(undefined, tmpDir);
    expect(config.model.provider).toBe('bedrock');
    expect(config.model.bedrock?.modelId).toBe('test-model');
    expect(config.model.bedrock?.region).toBe('eu-west-1');
    expect(config.sandbox.timeoutMs).toBe(10000);
    expect(config.agent.maxTurns).toBe(50);
  });

  it('applies defaults for missing optional fields', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: {
          provider: 'bedrock',
          bedrock: { modelId: 'test-model', region: 'us-east-1' },
        },
      }),
    );

    const { config } = await readConfig(undefined, tmpDir);
    expect(config.sandbox.timeoutMs).toBe(45000);
    expect(config.sandbox.denoPath).toBe('deno');
    expect(config.registry.maxCapabilities).toBe(500);
    expect(config.agent.maxTurns).toBe(100);
  });

  it('returns full defaults when config file is missing', async () => {
    fs.rmSync(path.join(tmpDir, '.tendril'), { recursive: true });
    const { config } = await readConfig(undefined, tmpDir);
    expect(config.model.provider).toBe('bedrock');
    expect(config.model.bedrock?.modelId).toBeDefined();
    expect(config.sandbox.timeoutMs).toBe(45000);
  });

  it('throws when bedrock.modelId is empty', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: { provider: 'bedrock', bedrock: { modelId: '', region: 'us-east-1' } },
      }),
    );

    await expect(readConfig(undefined, tmpDir)).rejects.toThrow('bedrock.modelId is required');
  });

  it('throws when bedrock.region is empty', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: { provider: 'bedrock', bedrock: { modelId: 'test', region: '' } },
      }),
    );

    await expect(readConfig(undefined, tmpDir)).rejects.toThrow('bedrock.region is required');
  });
});

// T005: Nested config schema validation
describe('nested config schema validation', () => {
  it('accepts valid bedrock config', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: {
          provider: 'bedrock',
          bedrock: { modelId: 'us.anthropic.claude-sonnet-4-5-20250514', region: 'us-east-1' },
        },
      }),
    );

    const { config } = await readConfig(undefined, tmpDir);
    expect(config.model.provider).toBe('bedrock');
    expect(config.model.bedrock?.modelId).toBe('us.anthropic.claude-sonnet-4-5-20250514');
  });

  it('accepts valid ollama config', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: {
          provider: 'ollama',
          ollama: { host: 'http://localhost:11434', modelId: 'llama3' },
        },
      }),
    );

    const { config } = await readConfig(undefined, tmpDir);
    expect(config.model.provider).toBe('ollama');
    expect(config.model.ollama?.host).toBe('http://localhost:11434');
    expect(config.model.ollama?.modelId).toBe('llama3');
  });

  it('accepts valid openai config', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: {
          provider: 'openai',
          openai: { modelId: 'gpt-4o' },
        },
      }),
    );

    const { config } = await readConfig(undefined, tmpDir);
    expect(config.model.provider).toBe('openai');
    expect(config.model.openai?.modelId).toBe('gpt-4o');
  });

  it('accepts valid anthropic config', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: {
          provider: 'anthropic',
          anthropic: { modelId: 'claude-sonnet-4-20250514' },
        },
      }),
    );

    const { config } = await readConfig(undefined, tmpDir);
    expect(config.model.provider).toBe('anthropic');
    expect(config.model.anthropic?.modelId).toBe('claude-sonnet-4-20250514');
  });

  it('rejects invalid provider string', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: { provider: 'invalid-provider', bedrock: { modelId: 'x', region: 'y' } },
      }),
    );

    await expect(readConfig(undefined, tmpDir)).rejects.toThrow();
  });

  it('rejects missing required provider block', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: { provider: 'ollama' },
      }),
    );

    await expect(readConfig(undefined, tmpDir)).rejects.toThrow('ollama config block is required');
  });

  it('rejects ollama config with missing modelId', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: {
          provider: 'ollama',
          ollama: { host: 'http://localhost:11434', modelId: '' },
        },
      }),
    );

    await expect(readConfig(undefined, tmpDir)).rejects.toThrow('ollama.modelId is required');
  });

  it('ignores inactive provider blocks during validation', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: {
          provider: 'bedrock',
          bedrock: { modelId: 'test', region: 'us-east-1' },
          ollama: { host: 'http://localhost:11434', modelId: 'llama3' },
        },
      }),
    );

    // Should not throw even though both blocks are present
    const { config } = await readConfig(undefined, tmpDir);
    expect(config.model.provider).toBe('bedrock');
    expect(config.model.ollama?.modelId).toBe('llama3'); // Retained but not active
  });

  it('retains all provider configs simultaneously', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: {
          provider: 'bedrock',
          bedrock: { modelId: 'test', region: 'us-east-1' },
          ollama: { host: 'http://localhost:11434', modelId: 'llama3' },
          openai: { modelId: 'gpt-4o' },
          anthropic: { modelId: 'claude-sonnet-4-20250514' },
        },
      }),
    );

    const { config } = await readConfig(undefined, tmpDir);
    expect(config.model.bedrock).toBeDefined();
    expect(config.model.ollama).toBeDefined();
    expect(config.model.openai).toBeDefined();
    expect(config.model.anthropic).toBeDefined();
  });
});

// T004: Legacy config migration tests
describe('migrateLegacyConfig', () => {
  it('migrates flat bedrock fields to nested block', () => {
    const legacy = {
      model: { modelId: 'us.anthropic.claude-sonnet-4-5-20250514', region: 'us-east-1', profile: 'myprofile' },
      sandbox: { denoPath: 'deno', timeoutMs: 45000, allowedDomains: [] },
    };

    const migrated = migrateLegacyConfig(legacy);
    const model = migrated.model as Record<string, unknown>;
    expect(model.provider).toBe('bedrock');
    expect(model.bedrock).toEqual({
      modelId: 'us.anthropic.claude-sonnet-4-5-20250514',
      region: 'us-east-1',
      profile: 'myprofile',
    });
    // Flat fields should be removed
    expect(model.modelId).toBeUndefined();
    expect(model.region).toBeUndefined();
  });

  it('migrates flat fields without profile', () => {
    const legacy = {
      model: { modelId: 'test-model', region: 'eu-west-1' },
    };

    const migrated = migrateLegacyConfig(legacy);
    const model = migrated.model as Record<string, unknown>;
    expect(model.provider).toBe('bedrock');
    expect(model.bedrock).toEqual({
      modelId: 'test-model',
      region: 'eu-west-1',
    });
  });

  it('does not migrate already-nested config', () => {
    const newFormat = {
      model: {
        provider: 'bedrock',
        bedrock: { modelId: 'test', region: 'us-east-1' },
      },
    };

    const result = migrateLegacyConfig(newFormat);
    expect(result).toEqual(newFormat);
  });

  it('does not modify config without model section', () => {
    const noModel = { sandbox: { denoPath: 'deno' } };
    const result = migrateLegacyConfig(noModel);
    expect(result).toEqual(noModel);
  });

  it('preserves existing provider field in flat config', () => {
    const legacy = {
      model: { provider: 'bedrock', modelId: 'test', region: 'us-east-1' },
    };

    const migrated = migrateLegacyConfig(legacy);
    const model = migrated.model as Record<string, unknown>;
    expect(model.provider).toBe('bedrock');
  });
});

// T004a: Full legacy config integration test
describe('legacy config integration', () => {
  it('reads a full legacy config and returns correct nested format', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        workspace: '/home/user/projects',
        model: { modelId: 'us.anthropic.claude-sonnet-4-5-20250514', region: 'us-east-1', profile: 'work' },
        sandbox: { denoPath: '/usr/local/bin/deno', timeoutMs: 30000, allowedDomains: ['api.example.com'] },
        registry: { maxCapabilities: 300 },
        agent: { maxTurns: 75 },
      }),
    );

    const { config, workspace } = await readConfig(undefined, tmpDir);
    expect(workspace).toBe('/home/user/projects');
    expect(config.model.provider).toBe('bedrock');
    expect(config.model.bedrock).toEqual({
      modelId: 'us.anthropic.claude-sonnet-4-5-20250514',
      region: 'us-east-1',
      profile: 'work',
    });
    expect(config.sandbox.timeoutMs).toBe(30000);
    expect(config.sandbox.allowedDomains).toEqual(['api.example.com']);
    expect(config.registry.maxCapabilities).toBe(300);
    expect(config.agent.maxTurns).toBe(75);
  });
});

// T004b: New-format bedrock config test
describe('new-format bedrock config', () => {
  it('reads new-format bedrock config without migration', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: {
          provider: 'bedrock',
          bedrock: { modelId: 'us.anthropic.claude-sonnet-4-5-20250514', region: 'us-east-1', profile: 'dev' },
        },
        sandbox: { denoPath: 'deno', timeoutMs: 45000, allowedDomains: [] },
        registry: { maxCapabilities: 500 },
        agent: { maxTurns: 100 },
      }),
    );

    const { config } = await readConfig(undefined, tmpDir);
    expect(config.model.provider).toBe('bedrock');
    expect(config.model.bedrock?.modelId).toBe('us.anthropic.claude-sonnet-4-5-20250514');
    expect(config.model.bedrock?.region).toBe('us-east-1');
    expect(config.model.bedrock?.profile).toBe('dev');
  });
});
