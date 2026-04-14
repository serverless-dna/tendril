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
      const registry = new CapabilityRegistry(workspacePath);
      const results = registry.search(query);
      return JSON.stringify(results, null, 2);
    },
  });
