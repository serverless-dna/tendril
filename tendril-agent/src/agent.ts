import { Agent } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { searchCapabilities } from './tools/search.js';
import { registerCapability } from './tools/register.js';
import { loadTool } from './tools/load.js';
import { executeCode } from './tools/execute.js';
import { TENDRIL_SYSTEM_PROMPT } from './prompt.js';
import type { WorkspaceConfig } from './types.js';

export function createAgent(config: WorkspaceConfig, workspacePath: string): Agent {
  const model = new BedrockModel({
    modelId: config.model.modelId,
    region: config.model.region,
  });

  return new Agent({
    model,
    systemPrompt: TENDRIL_SYSTEM_PROMPT(workspacePath),
    tools: [
      searchCapabilities(workspacePath),
      registerCapability(workspacePath),
      loadTool(workspacePath),
      executeCode(workspacePath),
    ],
  });
}
