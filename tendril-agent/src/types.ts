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

// === Provider Types ===

export type Provider = 'bedrock' | 'ollama' | 'openai' | 'anthropic';

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
