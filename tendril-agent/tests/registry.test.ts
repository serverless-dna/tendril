import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CapabilityRegistry } from '../src/loop/registry';

let tmpDir: string;
let registry: CapabilityRegistry;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tendril-reg-'));
  fs.mkdirSync(path.join(tmpDir, 'tools'));
  fs.writeFileSync(path.join(tmpDir, 'tools', 'index.json'), JSON.stringify({ version: '1.0.0', capabilities: [] }));
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
    it('registers a new capability', async () => {
      await registry.register(sampleDef, 'console.log("hello")');

      const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tools', 'index.json'), 'utf-8'));
      expect(index.capabilities).toHaveLength(1);
      expect(index.capabilities[0].name).toBe('fetch_url');

      const toolFile = fs.readFileSync(path.join(tmpDir, 'tools', 'fetch_url.ts'), 'utf-8');
      expect(toolFile).toBe('console.log("hello")');
    });

    it('updates existing capability with same name', async () => {
      await registry.register(sampleDef, 'v1');
      await registry.register(sampleDef, 'v2');

      const index = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tools', 'index.json'), 'utf-8'));
      expect(index.capabilities).toHaveLength(1);

      const toolFile = fs.readFileSync(path.join(tmpDir, 'tools', 'fetch_url.ts'), 'utf-8');
      expect(toolFile).toBe('v2');
    });
  });

  describe('list', () => {
    it('returns empty array when no capabilities registered', async () => {
      const results = await registry.list();
      expect(results).toHaveLength(0);
    });

    it('returns all capabilities with only selection fields', async () => {
      await registry.register(sampleDef, 'code');
      const results = await registry.list();
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        name: 'fetch_url',
        capability: 'Fetches a URL and returns text content',
        triggers: ['user provides a URL', 'user asks to fetch a page'],
        suppression: ['URL already fetched this session'],
      });
      // Must NOT include metadata fields
      expect(results[0]).not.toHaveProperty('tool_path');
      expect(results[0]).not.toHaveProperty('created');
      expect(results[0]).not.toHaveProperty('created_by');
      expect(results[0]).not.toHaveProperty('version');
    });

    it('returns multiple capabilities', async () => {
      await registry.register(sampleDef, 'code1');
      await registry.register({
        name: 'parse_json',
        capability: 'Parses JSON text',
        triggers: ['user asks to parse JSON'],
        suppression: [],
      }, 'code2');
      const results = await registry.list();
      expect(results).toHaveLength(2);
    });
  });

  describe('load', () => {
    it('loads tool implementation', async () => {
      await registry.register(sampleDef, 'const x = 1;');
      const code = await registry.load('fetch_url');
      expect(code).toBe('const x = 1;');
    });

    it('rejects for non-existent tool', async () => {
      await expect(registry.load('nonexistent')).rejects.toThrow();
    });
  });
});
