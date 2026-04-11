import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CapabilityRegistry } from '../src/registry';

let tmpDir: string;
let registry: CapabilityRegistry;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tendril-reg-'));
  fs.writeFileSync(path.join(tmpDir, 'index.json'), JSON.stringify({ version: '1.0.0', capabilities: [] }));
  fs.mkdirSync(path.join(tmpDir, 'tools'));
  registry = new CapabilityRegistry(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CapabilityRegistry', () => {
  const sampleDef = {
    name: 'fetch_url',
    capability: 'Fetches a URL and returns text content',
    triggers: ['user provides a URL', 'user asks to fetch a page'],
    suppression: ['URL already fetched this session'],
  };

  describe('register', () => {
    it('registers a new capability', () => {
      registry.register(sampleDef, 'console.log("hello")');

      const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'index.json'), 'utf-8'));
      expect(index.capabilities).toHaveLength(1);
      expect(index.capabilities[0].name).toBe('fetch_url');

      const toolFile = fs.readFileSync(path.join(tmpDir, 'tools', 'fetch_url.ts'), 'utf-8');
      expect(toolFile).toBe('console.log("hello")');
    });

    it('updates existing capability with same name', () => {
      registry.register(sampleDef, 'v1');
      registry.register(sampleDef, 'v2');

      const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'index.json'), 'utf-8'));
      expect(index.capabilities).toHaveLength(1);

      const toolFile = fs.readFileSync(path.join(tmpDir, 'tools', 'fetch_url.ts'), 'utf-8');
      expect(toolFile).toBe('v2');
    });
  });

  describe('search', () => {
    it('finds capabilities by name', () => {
      registry.register(sampleDef, 'code');
      const results = registry.search('fetch');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('fetch_url');
    });

    it('finds capabilities by trigger text', () => {
      registry.register(sampleDef, 'code');
      const results = registry.search('URL page');
      expect(results).toHaveLength(1);
    });

    it('returns empty for no match', () => {
      registry.register(sampleDef, 'code');
      const results = registry.search('database sql');
      expect(results).toHaveLength(0);
    });
  });

  describe('load', () => {
    it('loads tool implementation', () => {
      registry.register(sampleDef, 'const x = 1;');
      const code = registry.load('fetch_url');
      expect(code).toBe('const x = 1;');
    });

    it('throws for non-existent tool', () => {
      expect(() => registry.load('nonexistent')).toThrow('Tool not found');
    });
  });

  describe('list', () => {
    it('returns all capabilities', () => {
      registry.register(sampleDef, 'code1');
      registry.register({ ...sampleDef, name: 'summarize', capability: 'Summarizes text', triggers: ['summarize'], suppression: [] }, 'code2');
      expect(registry.list()).toHaveLength(2);
    });
  });

  describe('exists', () => {
    it('returns true for registered capability', () => {
      registry.register(sampleDef, 'code');
      expect(registry.exists('fetch_url')).toBe(true);
    });

    it('returns false for unregistered capability', () => {
      expect(registry.exists('nonexistent')).toBe(false);
    });
  });
});
