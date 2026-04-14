import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { CapabilityRegistry } from '../registry.js';

export const loadTool = (workspacePath: string) =>
  tool({
    name: 'loadTool',
    description: 'STEP 2a: Load a registered tool\'s code by name so you can pass it to execute().',
    inputSchema: z.object({
      name: z.string().describe('The snake_case name of the capability to load'),
    }),
    callback: ({ name }) => {
      const registry = new CapabilityRegistry(workspacePath);
      return registry.load(name);
    },
  });
