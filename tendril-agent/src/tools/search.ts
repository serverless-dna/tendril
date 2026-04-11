import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { CapabilityRegistry } from '../registry.js';

export const searchCapabilities = (workspacePath: string) =>
  tool({
    name: 'searchCapabilities',
    description:
      'Search the capability registry for existing tools matching the query. Call this before writing any new code.',
    inputSchema: z.object({
      query: z.string().describe('What capability to search for'),
    }),
    callback: ({ query }) => {
      const registry = new CapabilityRegistry(workspacePath);
      const results = registry.search(query);
      return JSON.stringify(results, null, 2);
    },
  });
