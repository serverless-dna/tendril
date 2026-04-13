import { Agent } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { searchCapabilities } from './tools/search.js';
import { registerCapability } from './tools/register.js';
import { loadTool } from './tools/load.js';
import { executeCode } from './tools/execute.js';
import { TENDRIL_SYSTEM_PROMPT } from './prompt.js';
import type { WorkspaceConfig } from './types.js';

// Null printer — suppresses Strands' default stdout printing.
// Strands SDK expects { print, printNewline } but doesn't export a Printer type.
const nullPrinter: { print: (...args: unknown[]) => void; printNewline: () => void } = {
  print: () => {},
  printNewline: () => {},
};

export function createAgent(config: WorkspaceConfig, workspacePath: string): Agent {
  // Set AWS_PROFILE before SDK init so the credential chain picks it up
  if (config.model.profile) {
    process.env.AWS_PROFILE = config.model.profile;
  }

  const model = new BedrockModel({
    modelId: config.model.modelId,
    region: config.model.region,
  });

  return new Agent({
    model,
    systemPrompt: TENDRIL_SYSTEM_PROMPT(workspacePath),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Strands SDK doesn't export a Printer type
    printer: nullPrinter as any,
    tools: [
      searchCapabilities(workspacePath),
      registerCapability(workspacePath),
      loadTool(workspacePath),
      executeCode(workspacePath),
    ],
  });
}
