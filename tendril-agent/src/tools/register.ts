import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import type { CapabilityRegistry } from '../registry.js';

export const registerCapability = (registry: CapabilityRegistry) =>
  tool({
    name: 'registerCapability',
    description:
      'STEP 2b: When searchCapabilities returns no results, register a NEW tool before executing. Write the definition and TypeScript code. After registering, call execute() with the same code.',
    inputSchema: z.object({
      definition: z.object({
        name: z.string().describe('snake_case tool name'),
        capability: z.string().describe('One-sentence description of what the tool does'),
        triggers: z.array(z.string()).describe('2-5 conversational signals for invocation'),
        suppression: z.array(z.string()).describe('Conditions that prevent invocation'),
      }),
      code: z.string().describe('TypeScript implementation to store'),
    }),
    callback: async ({ definition, code }) => {
      await registry.register(definition, code);
      return `Registered: ${definition.name}`;
    },
  });
