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

/** App configuration as stored in ~/.tendril/config.json */
export interface AppConfig {
  workspace?: string;
  model: {
    provider?: string;
    modelId: string;
    region: string;
    profile?: string;
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
