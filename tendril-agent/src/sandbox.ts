import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export async function executeDeno(
  code: string,
  args: Record<string, unknown>,
  workspacePath: string,
  denoPath: string,
  timeoutMs: number,
): Promise<string> {
  const prelude = `const args = ${JSON.stringify(args)};\nconst __workspace = ${JSON.stringify(workspacePath)};\n`;
  const script = `${prelude}\n${code}`;
  const tmpFile = path.join(workspacePath, `.tendril-exec-${Date.now()}.ts`);

  fs.writeFileSync(tmpFile, script);

  try {
    return await new Promise<string>((resolve, reject) => {
      const proc = spawn(denoPath, [
        'run',
        `--allow-read=${workspacePath}`,
        `--allow-write=${workspacePath}`,
        '--allow-net',
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
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}
