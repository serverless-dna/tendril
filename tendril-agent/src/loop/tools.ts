/**
 * Agentic loop tools — ordered by cycle step.
 *
 * The agent follows this loop on every user request:
 *   1. SEARCH  — listCapabilities() to find existing tools
 *   2a. LOAD   — loadTool(name) to retrieve a matching tool's code
 *   2b. CREATE — registerCapability() if no match exists
 *   3. EXECUTE — execute(code, args) to run in the Deno sandbox
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

// ── Step 2a: LOAD ───────────────────────────────────────────────────────────

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

// ── Step 2b: CREATE ─────────────────────────────────────────────────────────

export const registerCapability = (registry: CapabilityRegistry) =>
  tool({
    name: 'registerCapability',
    description:
      'STEP 2b: When listCapabilities shows no matching tool, register a NEW one before executing. Write the definition and TypeScript code. After registering, call execute() with the same code.',
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

// ── Step 3: EXECUTE ─────────────────────────────────────────────────────────

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
