/** Capability as returned by the read_capabilities Tauri command */
export interface Capability {
  name: string;
  capability: string;
  triggers: string[];
  suppression: string[];
  tool_path: string;
  created: string;
  created_by: string;
  version?: string;
}

/** Provider type */
export type Provider = 'bedrock' | 'ollama' | 'openai' | 'anthropic';

/** App configuration as stored in ~/.tendril/config.json */
export interface AppConfig {
  workspace?: string;
  model: {
    provider: Provider;
    bedrock?: {
      modelId: string;
      region: string;
      profile?: string;
    };
    ollama?: {
      host: string;
      modelId: string;
    };
    openai?: {
      modelId: string;
    };
    anthropic?: {
      modelId: string;
    };
  };
  sandbox: {
    denoPath?: string;
    timeoutMs: number;
    allowedDomains?: string[];
  };
  registry?: {
    maxCapabilities?: number;
  };
  agent: {
    maxTurns: number;
  };
}
