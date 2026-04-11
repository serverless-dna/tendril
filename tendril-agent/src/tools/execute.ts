import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { executeDeno } from '../sandbox.js';
import { readConfig } from '../config.js';

export const executeCode = (workspacePath: string) =>
  tool({
    name: 'execute',
    description:
      'Execute TypeScript code in the Deno sandbox. Output via console.log() is returned as the result.',
    inputSchema: z.object({
      code: z.string().describe('TypeScript code to execute'),
      args: z.record(z.unknown()).optional().describe('Optional arguments object passed to the code'),
    }),
    callback: async ({ code, args }) => {
      const config = readConfig(workspacePath);
      return executeDeno(
        code,
        args ?? {},
        workspacePath,
        config.sandbox.denoPath,
        config.sandbox.timeoutMs,
      );
    },
  });
