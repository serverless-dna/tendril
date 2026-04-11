import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { CapabilityRegistry } from '../registry.js';

export const registerCapability = (workspacePath: string) =>
  tool({
    name: 'registerCapability',
    description:
      'Register a new Agency Capability definition and store its TypeScript implementation to the registry.',
    inputSchema: z.object({
      definition: z.object({
        name: z.string().describe('snake_case tool name'),
        capability: z.string().describe('One-sentence description of what the tool does'),
        triggers: z.array(z.string()).describe('2-5 conversational signals for invocation'),
        suppression: z.array(z.string()).describe('Conditions that prevent invocation'),
      }),
      code: z.string().describe('TypeScript implementation to store'),
    }),
    callback: ({ definition, code }) => {
      const registry = new CapabilityRegistry(workspacePath);
      registry.register(definition, code);
      return `Registered: ${definition.name}`;
    },
  });
