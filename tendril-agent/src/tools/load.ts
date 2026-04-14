import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import type { CapabilityRegistry } from '../registry.js';

export const loadTool = (registry: CapabilityRegistry) =>
  tool({
    name: 'loadTool',
    description: 'STEP 2a: Load a registered tool\'s code by name so you can pass it to execute().',
    inputSchema: z.object({
      name: z.string().describe('The snake_case name of the capability to load'),
    }),
    callback: async ({ name }) => {
      return registry.load(name);
    },
  });
