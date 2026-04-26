import { Agent, Model, type BaseModelConfig } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { OpenAIModel } from '@strands-agents/sdk/models/openai';
import { AnthropicModel } from '@strands-agents/sdk/models/anthropic';
import { listCapabilities, registerCapability, executeCode } from './loop/tools.js';
import { TENDRIL_SYSTEM_PROMPT } from './loop/prompt.js';
import { CapabilityRegistry } from './loop/registry.js';
import type { WorkspaceConfig } from './config.js';
import type { Provider } from './types.js';

// Null printer — suppresses Strands' default stdout printing.
// Strands SDK expects { print, printNewline } but doesn't export a Printer type.
const nullPrinter: { print: (...args: unknown[]) => void; printNewline: () => void } = {
  print: () => {},
  printNewline: () => {},
};

/**
 * Create the appropriate Strands model instance based on provider config.
 * Ollama uses OpenAIModel with a custom baseURL (OpenAI-compatible API).
 */
export function createModel(config: WorkspaceConfig): { model: Model<BaseModelConfig>; provider: Provider } {
  const provider = config.model.provider;

  switch (provider) {
    case 'bedrock': {
      const bc = config.model.bedrock;
      if (!bc) throw new Error('bedrock config block is required when provider is bedrock');
      // Set AWS_PROFILE before SDK init so the credential chain picks it up
      if (bc.profile) {
        process.env.AWS_PROFILE = bc.profile;
      }
      return {
        model: new BedrockModel({
          modelId: bc.modelId,
          region: bc.region,
        }),
        provider,
      };
    }

    case 'ollama': {
      const oc = config.model.ollama;
      if (!oc) throw new Error('ollama config block is required when provider is ollama');
      return {
        model: new OpenAIModel({
          api: 'chat',
          modelId: oc.modelId,
          apiKey: 'ollama', // Ollama ignores auth; dummy value satisfies SDK validation
          clientConfig: { baseURL: `${oc.host.replace(/\/$/, '')}/v1` },
        }),
        provider,
      };
    }

    case 'openai': {
      const oac = config.model.openai;
      if (!oac) throw new Error('openai config block is required when provider is openai');
      // API key is injected via OPENAI_API_KEY env var by Tauri at spawn time
      return {
        model: new OpenAIModel({
          api: 'chat',
          modelId: oac.modelId,
        }),
        provider,
      };
    }

    case 'anthropic': {
      const ac = config.model.anthropic;
      if (!ac) throw new Error('anthropic config block is required when provider is anthropic');
      // API key is injected via ANTHROPIC_API_KEY env var by Tauri at spawn time
      return {
        model: new AnthropicModel({
          modelId: ac.modelId,
        }),
        provider,
      };
    }

    default:
      throw new Error(`Unsupported provider: ${provider as string}. Supported: bedrock, ollama, openai, anthropic`);
  }
}

export function createAgent(config: WorkspaceConfig, workspacePath: string): Agent {
  const { model } = createModel(config);

  // Single registry instance shared by all tool callbacks
  const registry = new CapabilityRegistry(workspacePath);

  return new Agent({
    model,
    systemPrompt: TENDRIL_SYSTEM_PROMPT(workspacePath),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Strands SDK doesn't export a Printer type
    printer: nullPrinter as any,
    tools: [
      listCapabilities(registry),
      registerCapability(registry),
      executeCode(registry, workspacePath, config),
    ],
  });
}
