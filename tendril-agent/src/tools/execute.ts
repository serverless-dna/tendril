import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { executeDeno } from '../sandbox.js';
import type { WorkspaceConfig } from '../config.js';

export const executeCode = (workspacePath: string, config: WorkspaceConfig) =>
  tool({
    name: 'execute',
    description:
      'Execute a registered tool in the Deno sandbox. Use loadTool() to get the code first. Do NOT write code inline — register it with registerCapability() first, then execute it.',
    inputSchema: z.object({
      code: z.string().describe('TypeScript code to execute'),
      args: z.string().optional().describe('Optional JSON string of arguments object passed to the code'),
    }),
    callback: async ({ code, args }) => {
      let parsedArgs: Record<string, unknown> = {};
      if (args) {
        try {
          parsedArgs = JSON.parse(args);
        } catch (err) {
          throw new Error(`Failed to parse args: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return executeDeno(
        code,
        parsedArgs,
        workspacePath,
        config.sandbox.denoPath,
        config.sandbox.timeoutMs,
        config.sandbox.allowedDomains,
      );
    },
  });
