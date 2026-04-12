import { readConfig } from './config.js';
import { createAgent } from './agent.js';
import { startProtocolLoop, emitUpdate } from './protocol.js';
import type { ProtocolContext } from './protocol.js';

// Guard stdout — only allow JSON writes. Strands SDK sometimes writes raw text.
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function(chunk: string | Uint8Array, ...args: unknown[]): boolean {
  const str = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
  const trimmed = str.trim();
  if (trimmed && !trimmed.startsWith('{')) {
    // Not JSON — redirect to stderr as diagnostic
    process.stderr.write(`[stdout-guard] ${trimmed}\n`);
    return true;
  }
  return originalStdoutWrite(chunk, ...(args as [BufferEncoding, () => void]));
} as typeof process.stdout.write;

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
      let lastResult: unknown = undefined;

      for await (const event of stream) {
        handleStreamEvent(event);
        lastResult = event;
      }

      // Extract metrics from the final event
      const metrics = extractMetrics(lastResult);
      emitTurnEnd(metrics);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[tendril-agent] Error: ${message}\n`);

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

function handleStreamEvent(event: unknown): void {
  if (!event || typeof event !== 'object') return;
  const e = event as Record<string, unknown>;
  const type = (e.type as string) ?? e.constructor?.name ?? 'unknown';

  // Log event type and keys for diagnostics
  const keys = Object.keys(e).filter(k => k !== 'constructor');
  process.stderr.write(`[stream] ${type} keys=${JSON.stringify(keys)}\n`);

  // For modelStreamUpdateEvent, log the actual data structure
  if (type.includes('modelStream') || type.includes('ModelStream')) {
    process.stderr.write(`[stream-data] ${JSON.stringify(e, (_, v) => typeof v === 'function' ? '[fn]' : v)}\n`);
  }

  // Text streaming — try multiple field patterns
  const delta = (e.delta as string) ?? (e.text as string) ?? (e.data as Record<string,unknown>)?.delta as string ?? (e.data as Record<string,unknown>)?.text as string ?? (e.chunk as string) ?? '';
  if (delta && (type.includes('Stream') || type.includes('stream') || type.includes('ContentBlock') || type.includes('content_block'))) {
    emitUpdate({
      sessionUpdate: 'agent_message_chunk',
      text: delta,
      content: { type: 'text', text: delta },
    });
    return;
  }

  // Tool call announced
  if (type.includes('ToolCall') || type.includes('tool_call') || type.includes('BeforeTool') || type.includes('before_tool')) {
    turnToolCallCounter++;
    const toolUse = (e.toolUse as Record<string, unknown>) ?? e;
    emitUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: (toolUse.toolUseId as string) ?? `tool-${turnToolCallCounter}`,
      title: (toolUse.name as string) ?? 'unknown',
      kind: (toolUse.name as string) === 'execute' ? 'execute' : 'other',
      input: toolUse.input ?? {},
    });
    return;
  }

  // Tool result
  if (type.includes('ToolResult') || type.includes('tool_result')) {
    emitUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: (e.toolUseId as string) ?? `tool-${turnToolCallCounter}`,
      status: 'completed',
      rawOutput: typeof e.result === 'string' ? e.result : JSON.stringify(e.result),
      title: (e.name as string) ?? 'unknown',
    });
    return;
  }
}

function extractMetrics(lastEvent: unknown): AgentMetrics | undefined {
  if (!lastEvent || typeof lastEvent !== 'object') return undefined;
  const e = lastEvent as Record<string, unknown>;
  if (e.metrics) return e.metrics as AgentMetrics;
  if (e.result && typeof e.result === 'object') {
    const r = e.result as Record<string, unknown>;
    if (r.metrics) return r.metrics as AgentMetrics;
  }
  return undefined;
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
  const authPatterns = ['UnrecognizedClientException', 'AccessDeniedException', 'ExpiredTokenException', 'credentials', 'security token'];
  return authPatterns.some((p) => message.toLowerCase().includes(p.toLowerCase()));
}

startProtocolLoop(ctx);
