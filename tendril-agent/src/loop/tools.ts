/**
 * Agentic loop tools — ordered by cycle step.
 *
 * The agent follows this loop on every action:
 *   1. SEARCH  — listCapabilities() to find existing tools
 *   2. CREATE  — registerCapability() if no match exists
 *   3. EXECUTE — execute(name, args) to load from registry and run
 *
 * The model never passes raw code to execute(). It passes a capability
 * name, and execute() loads the code from the registry. This is enforced
 * at the API level — there is no code parameter to bypass.
 *
 * The Strands SDK drives the loop: model thinks → picks a tool → observes
 * the result → thinks again → picks the next tool → until done.
 */

import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import type { CapabilityRegistry } from './registry.js';
import { executeDeno } from './sandbox.js';
import type { WorkspaceConfig } from '../config.js';

// ── Step 1: SEARCH ──────────────────────────────────────────────────────────

export const listCapabilities = (registry: CapabilityRegistry) =>
  tool({
    name: 'listCapabilities',
    description:
      'STEP 1 of every action. List all registered tools. Read the results to decide which tool to execute, or whether to register a new one.',
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

// ── Step 2: CREATE ──────────────────────────────────────────────────────────

export const registerCapability = (registry: CapabilityRegistry) =>
  tool({
    name: 'registerCapability',
    description:
      'STEP 2: When listCapabilities shows no matching tool, register a NEW one. Write the definition and TypeScript code. After registering, call execute(name, args) to run it.',
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
      return `Registered: ${definition.name}. Now call execute(name: "${definition.name}", args: ...) to run it.`;
    },
  });

// ── Step 3: EXECUTE ─────────────────────────────────────────────────────────

export const executeCode = (registry: CapabilityRegistry, workspacePath: string, config: WorkspaceConfig) =>
  tool({
    name: 'execute',
    description:
      'STEP 3: Run a registered capability by name. The code is loaded from the registry automatically — you only provide the name and args. You cannot pass code directly.',
    inputSchema: z.object({
      name: z.string().describe('The snake_case name of the registered capability to execute'),
      args: z.string().optional().describe('Optional JSON string of arguments object passed to the code'),
    }),
    callback: async ({ name, args }) => {
      // Load code from registry — enforces that only registered tools can run
      let code: string;
      try {
        code = await registry.load(name);
      } catch (err) {
        throw new Error(`Cannot execute '${name}': tool not found in registry. Register it first with registerCapability().`);
      }

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
