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
      args: z.string().optional().describe('Optional JSON string of arguments object passed to the code'),
    }),
    callback: async ({ code, args }) => {
      const config = readConfig(workspacePath);
      const parsedArgs = args ? JSON.parse(args) : {};
      return executeDeno(
        code,
        parsedArgs,
        workspacePath,
        config.sandbox.denoPath,
        config.sandbox.timeoutMs,
      );
    },
  });
