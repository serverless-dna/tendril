import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tendril-int-'));
  fs.writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({ version: '1.0.0', capabilities: [] }),
  );
  fs.mkdirSync(path.join(dir, 'tools'));
  fs.mkdirSync(path.join(dir, '.tendril'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.tendril', 'config.json'),
    JSON.stringify({
      model: { provider: 'bedrock', modelId: 'test-model', region: 'us-east-1' },
      sandbox: { denoPath: 'deno', timeoutMs: 5000, allowedDomains: [] },
      registry: { maxCapabilities: 100 },
      agent: { maxTurns: 10 },
    }),
  );
  return dir;
}

function sendLine(proc: ReturnType<typeof spawn>, obj: Record<string, unknown>): void {
  proc.stdin!.write(JSON.stringify(obj) + '\n');
}

function collectLines(proc: ReturnType<typeof spawn>): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    let buffer = '';
    proc.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const parts = buffer.split('\n');
      buffer = parts.pop()!;
      lines.push(...parts.filter((l) => l.trim()));
    });
    proc.on('close', () => {
      if (buffer.trim()) lines.push(buffer.trim());
      resolve(lines);
    });
  });
}

describe('ACP Integration', () => {
  it('should handle initialize → new_session → shutdown sequence', async () => {
    const workspace = createTempWorkspace();
    const entryPoint = path.join(__dirname, '..', 'dist', 'main.cjs');

    // Skip if not built
    if (!fs.existsSync(entryPoint)) {
      console.log('Skipping integration test — run npm run build first');
      return;
    }

    const proc = spawn('node', [entryPoint, workspace], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const linesPromise = collectLines(proc);

    // Send initialize
    sendLine(proc, {
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: {
        protocolVersion: '1.0.0',
        clientInfo: { name: 'test', version: '0.1.0' },
        capabilities: {},
      },
    });

    // Give time for response
    await new Promise((r) => setTimeout(r, 500));

    // Send new_session
    sendLine(proc, {
      jsonrpc: '2.0',
      id: 'session-1',
      method: 'new_session',
      params: { workingDirectory: workspace },
    });

    await new Promise((r) => setTimeout(r, 500));

    // Close stdin to trigger shutdown
    proc.stdin!.end();

    const lines = await linesPromise;
    const parsed = lines.map((l) => JSON.parse(l));

    // Verify initialize response
    const initResponse = parsed.find((m) => m.id === 'init-1');
    expect(initResponse).toBeDefined();
    expect(initResponse.result.agentInfo.name).toBe('tendril-agent');

    // Verify new_session response
    const sessionResponse = parsed.find((m) => m.id === 'session-1');
    expect(sessionResponse).toBeDefined();
    expect(sessionResponse.result.sessionId).toBeDefined();

    // Verify connected lifecycle event
    const connected = parsed.find(
      (m) =>
        m.method === 'session/update' &&
        m.params?.update?.sessionUpdate === 'session_lifecycle' &&
        m.params?.update?.stage === 'connected',
    );
    expect(connected).toBeDefined();

    // Cleanup
    fs.rmSync(workspace, { recursive: true, force: true });
  });
});
