import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readConfig } from '../src/config';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tendril-cfg-'));
  fs.mkdirSync(path.join(tmpDir, '.tendril'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readConfig', () => {
  it('reads a valid config file', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({
        model: { provider: 'bedrock', modelId: 'test-model', region: 'eu-west-1' },
        sandbox: { denoPath: '/usr/bin/deno', timeoutMs: 10000, allowedDomains: ['example.com'] },
        registry: { maxCapabilities: 200 },
        agent: { maxTurns: 50 },
      }),
    );

    const { config } = readConfig(undefined, tmpDir);
    expect(config.model.modelId).toBe('test-model');
    expect(config.model.region).toBe('eu-west-1');
    expect(config.sandbox.timeoutMs).toBe(10000);
    expect(config.agent.maxTurns).toBe(50);
  });

  it('applies defaults for missing optional fields', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({ model: { modelId: 'test-model', region: 'us-east-1' } }),
    );

    const { config } = readConfig(undefined, tmpDir);
    expect(config.sandbox.timeoutMs).toBe(45000);
    expect(config.sandbox.denoPath).toBe('deno');
    expect(config.registry.maxCapabilities).toBe(500);
    expect(config.agent.maxTurns).toBe(100);
  });

  it('returns full defaults when config file is missing', () => {
    fs.rmSync(path.join(tmpDir, '.tendril'), { recursive: true });
    const { config } = readConfig(undefined, tmpDir);
    expect(config.model.modelId).toBeDefined();
    expect(config.sandbox.timeoutMs).toBe(45000);
  });

  it('throws when model.modelId is empty', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({ model: { modelId: '', region: 'us-east-1' } }),
    );

    expect(() => readConfig(undefined, tmpDir)).toThrow('model.modelId is required');
  });

  it('throws when model.region is empty', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tendril', 'config.json'),
      JSON.stringify({ model: { modelId: 'test', region: '' } }),
    );

    expect(() => readConfig(undefined, tmpDir)).toThrow('model.region is required');
  });
});
