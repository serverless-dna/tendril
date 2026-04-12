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
process.stderr.write(`[tendril-agent] deno: ${config.sandbox.denoPath}\n`);
if (config.model.profile) {
  process.stderr.write(`[tendril-agent] AWS profile: ${config.model.profile}\n`);
}

const agent = createAgent(config, workspacePath);

let turnStartTime = 0;
let turnToolCallCounter = 0;
let lastUsage: { inputTokens: number; outputTokens: number } | null = null;
let lastToolCallId: string = '';

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
      lastUsage = null;
      const stream = agent.stream(userText);

      for await (const event of stream) {
        handleStreamEvent(event);
      }

      emitTurnEnd();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[tendril-agent] Error: ${message}\n`);

      if (isAuthError(message)) {
        emitUpdate({ sessionUpdate: 'error', message: `Bedrock authentication failed: ${message}` });
      } else {
        emitUpdate({ sessionUpdate: 'error', message });
      }

      emitTurnEnd();
    }
  },

  onCancel(_requestId: string) {
    agent.cancel();
  },
};

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

  // modelStreamUpdateEvent — nested at event.event.delta.text
  if (type === 'modelStreamUpdateEvent') {
    const inner = e.event as Record<string, unknown> | undefined;
    if (!inner) return;
    const innerType = inner.type as string;

    // Text delta
    if (innerType === 'modelContentBlockDeltaEvent') {
      const delta = inner.delta as Record<string, unknown> | undefined;
      const text = delta?.text as string | undefined;
      if (text) {
        emitUpdate({
          sessionUpdate: 'agent_message_chunk',
          text,
          content: { type: 'text', text },
        });
      }
      return;
    }

    // Metadata (tokens)
    if (innerType === 'modelMetadataEvent') {
      const usage = inner.usage as Record<string, number> | undefined;
      if (usage) {
        lastUsage = {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
        };
      }
      return;
    }

    return;
  }

  // Tool call announced — beforeToolCallEvent
  if (type === 'beforeToolCallEvent') {
    turnToolCallCounter++;
    const toolUse = (e.toolUse as Record<string, unknown>) ?? e;
    lastToolCallId = (toolUse.toolUseId as string) ?? `tool-${turnToolCallCounter}`;
    emitUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: lastToolCallId,
      title: (toolUse.name as string) ?? 'unknown',
      kind: (toolUse.name as string) === 'execute' ? 'execute' : 'other',
      input: toolUse.input ?? {},
    });
    return;
  }

  // Tool result — toolResultEvent / afterToolCallEvent
  if (type === 'toolResultEvent' || type === 'afterToolCallEvent') {
    const result = (e.result as Record<string, unknown>) ?? e;
    const rawOutput = result.content ?? result.result ?? result.text ?? '';
    emitUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: lastToolCallId || `tool-${turnToolCallCounter}`,
      status: 'completed',
      rawOutput: typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput),
      title: (e.name as string) ?? 'unknown',
    });
    return;
  }
}

function emitTurnEnd(): void {
  const durationMs = Date.now() - turnStartTime;
  const inputTokens = lastUsage?.inputTokens ?? 0;
  const outputTokens = lastUsage?.outputTokens ?? 0;
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
