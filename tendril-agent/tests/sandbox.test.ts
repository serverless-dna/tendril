import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { executeDeno } from '../src/sandbox';

let tmpDir: string;
let denoAvailable: boolean;

try {
  execSync('deno --version', { stdio: 'pipe' });
  denoAvailable = true;
} catch {
  denoAvailable = false;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tendril-sandbox-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('executeDeno', () => {
  it.skipIf(!denoAvailable)('executes code and captures stdout', async () => {
    const result = await executeDeno('console.log("hello world")', {}, tmpDir, 'deno', 10000);
    expect(result).toBe('hello world');
  });

  it.skipIf(!denoAvailable)('passes args to code', async () => {
    const result = await executeDeno('console.log(args.name)', { name: 'tendril' }, tmpDir, 'deno', 10000);
    expect(result).toBe('tendril');
  });

  it.skipIf(!denoAvailable)('enforces timeout', async () => {
    await expect(
      executeDeno('while(true) {}', {}, tmpDir, 'deno', 1000),
    ).rejects.toThrow('timeout');
  });

  it.skipIf(!denoAvailable)('cleans up temp files after execution', async () => {
    await executeDeno('console.log("clean")', {}, tmpDir, 'deno', 10000);

    const files = fs.readdirSync(tmpDir);
    const tempFiles = files.filter((f) => f.startsWith('.tendril-exec-'));
    expect(tempFiles).toHaveLength(0);
  });

  it('rejects with error for invalid deno path', async () => {
    await expect(
      executeDeno('console.log("hi")', {}, tmpDir, '/nonexistent/deno', 5000),
    ).rejects.toThrow();
  });
});
