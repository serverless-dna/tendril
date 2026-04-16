import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export async function executeDeno(
  code: string,
  args: Record<string, unknown>,
  workspacePath: string,
  denoPath: string,
  timeoutMs: number,
  allowedDomains: string[] = [],
): Promise<string> {
  const prelude = `const args = ${JSON.stringify(args)};\nconst __workspace = ${JSON.stringify(workspacePath)};\n`;
  const script = `${prelude}\n${code}`;

  // Use cryptographically random filename in OS temp directory
  const tmpFile = path.join(os.tmpdir(), `.tendril-exec-${crypto.randomUUID()}.ts`);

  await fs.writeFile(tmpFile, script);

  try {
    return await new Promise<string>((resolve, reject) => {
      const netFlag = allowedDomains.length > 0
        ? `--allow-net=${allowedDomains.join(',')}`
        : '--allow-net';

      const proc = spawn(denoPath, [
        'run',
        `--allow-read=${workspacePath}`,
        `--allow-write=${workspacePath}`,
        netFlag,
        '--no-prompt',
        '--quiet',
        tmpFile,
      ]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`Execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on('close', (exitCode) => {
        clearTimeout(timeout);
        if (exitCode === 0) {
          resolve(stdout.trim() || '(no output)');
        } else {
          reject(new Error(stderr.trim() || `Exit code ${exitCode}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn Deno: ${err.message}`));
      });
    });
  } finally {
    try {
      await fs.unlink(tmpFile);
    } catch {
      // Best effort cleanup — file may already be gone
    }
  }
}
