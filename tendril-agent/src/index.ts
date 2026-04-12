import { readConfig } from './config.js';
import { createAgent } from './agent.js';
import { startProtocolLoop, emitUpdate } from './protocol.js';
import type { ProtocolContext, } from './protocol.js';

// Workspace can be passed as arg or read from ~/.tendril/config.json
const workspaceArg = process.argv[2] || undefined;
const { config, workspace: workspacePath } = readConfig(workspaceArg);

process.stderr.write(`[tendril-agent] workspace: ${workspacePath}\n`);
process.stderr.write(`[tendril-agent] model: ${config.model.modelId} (${config.model.region})\n`);
if (config.model.profile) {
  process.stderr.write(`[tendril-agent] AWS profile: ${config.model.profile}\n`);
}

const agent = createAgent(config, workspacePath);

let turnStartTime = 0;
let turnToolCallCounter = 0;

const ctx: ProtocolContext = {
  sessionId: null,

  async onPrompt(_sessionId: string, messages: unknown[]) {
    turnStartTime = Date.now();
    turnToolCallCounter = 0;

    const lastMessage = (messages as Array<{ role: string; content: unknown[] }>).at(-1);
    const userText = extractTextContent(lastMessage?.content);

    if (!userText) {
      emitUpdate({ sessionUpdate: 'prompt_complete', stop_reason: 'end_turn' });
      return;
    }

    try {
      const stream = agent.stream(userText);

      for await (const event of stream) {
        handleStreamEvent(event);
      }

      const result = stream.return?.(undefined as never);
      const metrics = (result as { value?: { metrics?: AgentMetrics } })?.value?.metrics;

      emitTurnEnd(metrics);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (isAuthError(message)) {
        emitUpdate({ sessionUpdate: 'error', message: `Bedrock authentication failed: ${message}` });
      } else {
        emitUpdate({ sessionUpdate: 'error', message });
      }

      emitTurnEnd(undefined);
    }
  },

  onCancel(_requestId: string) {
    agent.cancel();
  },
};

interface AgentMetrics {
  accumulatedUsage?: { inputTokens?: number; outputTokens?: number };
  cycleCount?: number;
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === 'object' && block !== null && 'type' in block) {
        const b = block as { type: string; text?: string };
        if (b.type === 'text' && b.text) return b.text;
      }
    }
  }
  return '';
}

function handleStreamEvent(event: { type?: string; [key: string]: unknown }): void {
  const type = event.type ?? event.constructor?.name ?? '';

  if (type === 'ModelStreamUpdateEvent' || type === 'model_stream_update') {
    const delta = (event as { delta?: string }).delta ?? '';
    if (delta) {
      emitUpdate({
        sessionUpdate: 'agent_message_chunk',
        text: delta,
        content: { type: 'text', text: delta },
      });
    }
  } else if (type === 'BeforeToolCallEvent' || type === 'before_tool_call') {
    turnToolCallCounter++;
    const toolUse = (event as { toolUse?: { name?: string; toolUseId?: string; input?: unknown } }).toolUse;
    emitUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: toolUse?.toolUseId ?? `tool-${turnToolCallCounter}`,
      title: toolUse?.name ?? 'unknown',
      kind: toolUse?.name === 'execute' ? 'execute' : 'other',
      input: toolUse?.input ?? {},
    });
  } else if (type === 'ToolResultEvent' || type === 'tool_result') {
    const toolResult = event as { toolUseId?: string; result?: unknown; name?: string };
    emitUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: toolResult.toolUseId ?? `tool-${turnToolCallCounter}`,
      status: 'completed',
      rawOutput: typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result),
      title: toolResult.name ?? 'unknown',
    });
  }
}

function emitTurnEnd(metrics: AgentMetrics | undefined): void {
  const durationMs = Date.now() - turnStartTime;
  const inputTokens = metrics?.accumulatedUsage?.inputTokens ?? 0;
  const outputTokens = metrics?.accumulatedUsage?.outputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;

  emitUpdate({
    sessionUpdate: 'message_usage',
    message_id: `msg-${Date.now()}`,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    total_tokens: totalTokens,
    duration_ms: durationMs,
  });

  const inputCost = inputTokens * 0.000003;
  const outputCost = outputTokens * 0.000015;

  emitUpdate({
    sessionUpdate: 'query_result',
    cost: inputCost + outputCost,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    total_tokens: totalTokens,
    duration_ms: durationMs,
    context_tokens: inputTokens,
    context_limit: 200000,
  });

  emitUpdate({
    sessionUpdate: 'prompt_complete',
    stop_reason: 'end_turn',
  });
}

function isAuthError(message: string): boolean {
  const authPatterns = ['UnrecognizedClientException', 'AccessDeniedException', 'ExpiredTokenException', 'credentials'];
  return authPatterns.some((p) => message.includes(p));
}

startProtocolLoop(ctx);
