import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { CapabilityRegistry } from '../registry.js';

export const searchCapabilities = (workspacePath: string) =>
  tool({
    name: 'searchCapabilities',
    description:
      'STEP 1 of every request. Search the registry for an existing tool. If results are empty, you MUST call registerCapability next — never call execute without a registered tool.',
    inputSchema: z.object({
      query: z.string().describe('What capability to search for'),
    }),
    callback: ({ query }) => {
      try {
        const registry = new CapabilityRegistry(workspacePath);
        const results = registry.search(query);
        if (results.length === 0) {
          return 'No tools found. You MUST call registerCapability to create one.';
        }
        return JSON.stringify(results, null, 2);
      } catch {
        return 'Registry empty or not initialised. You MUST call registerCapability to create a tool.';
      }
    },
  });
