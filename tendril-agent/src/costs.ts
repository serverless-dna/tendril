import type { Provider } from './types.js';
import type { WorkspaceConfig } from './config.js';

// Provider-aware cost lookup table (USD per token)
export interface ProviderCosts {
  inputCostPerToken: number;
  outputCostPerToken: number;
  contextLimit: number;
}

export const PROVIDER_COSTS: Record<Provider, ProviderCosts> = {
  bedrock: { inputCostPerToken: 0.000003, outputCostPerToken: 0.000015, contextLimit: 200_000 },
  openai: { inputCostPerToken: 0.0000025, outputCostPerToken: 0.00001, contextLimit: 128_000 },
  anthropic: { inputCostPerToken: 0.000003, outputCostPerToken: 0.000015, contextLimit: 200_000 },
  ollama: { inputCostPerToken: 0, outputCostPerToken: 0, contextLimit: 128_000 },
};

/** Get the active model ID from config based on provider */
export function getActiveModelId(config: WorkspaceConfig): string {
  const p = config.model.provider;
  switch (p) {
    case 'bedrock': return config.model.bedrock?.modelId ?? 'unknown';
    case 'ollama': return config.model.ollama?.modelId ?? 'unknown';
    case 'openai': return config.model.openai?.modelId ?? 'unknown';
    case 'anthropic': return config.model.anthropic?.modelId ?? 'unknown';
    default: return 'unknown';
  }
}
