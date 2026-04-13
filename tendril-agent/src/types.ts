// === Capability Registry Types ===

export interface CapabilityDefinition {
  name: string;
  capability: string;
  triggers: string[];
  suppression: string[];
  tool_path: string;
  created: string;
  created_by: 'model' | 'human';
  version: string;
}

export interface CapabilityIndex {
  version: string;
  capabilities: CapabilityDefinition[];
}

// === Workspace Config Types ===

export interface ModelConfig {
  provider: string;
  modelId: string;
  region: string;
  profile?: string;
}

export interface SandboxConfig {
  denoPath: string;
  timeoutMs: number;
  allowedDomains: string[];
}

export interface RegistryConfig {
  maxCapabilities: number;
}

export interface AgentConfig {
  maxTurns: number;
}

export interface WorkspaceConfig {
  model: ModelConfig;
  sandbox: SandboxConfig;
  registry: RegistryConfig;
  agent: AgentConfig;
}

// === ACP Protocol Types ===

export interface AcpRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

// === Stream Event Types ===

export type SessionUpdateType =
  | 'session_lifecycle'
  | 'agent_message_chunk'
  | 'tool_call'
  | 'tool_call_update'
  | 'message_usage'
  | 'query_result'
  | 'prompt_complete'
  | 'error';

export interface SessionUpdate {
  sessionUpdate: SessionUpdateType;
  [key: string]: unknown;
}

export interface MessageUsage {
  sessionUpdate: 'message_usage';
  message_id: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  duration_ms: number;
}

export interface QueryResult {
  sessionUpdate: 'query_result';
  cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  duration_ms: number;
  context_tokens: number;
  context_limit: number;
}

export interface PromptComplete {
  sessionUpdate: 'prompt_complete';
  stop_reason: 'end_turn' | 'interrupted' | 'interrupt_safety_timeout' | 'max_tokens';
}
