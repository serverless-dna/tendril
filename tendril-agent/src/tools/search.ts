import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import type { CapabilityRegistry } from '../registry.js';

export const listCapabilities = (registry: CapabilityRegistry) =>
  tool({
    name: 'listCapabilities',
    description:
      'STEP 1 of every request. List all registered tools. Read the results to decide which tool to load, or whether to register a new one.',
    inputSchema: z.object({}),
    callback: async () => {
      try {
        const results = await registry.list();
        if (results.length === 0) {
          return 'No tools registered. You MUST call registerCapability to create one.';
        }
        return JSON.stringify(results, null, 2);
      } catch {
        return 'Registry empty or not initialised. You MUST call registerCapability to create a tool.';
      }
    },
  });
