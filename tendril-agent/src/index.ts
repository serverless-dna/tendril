import { readConfig } from './config.js';
import { createAgent } from './agent.js';
import { startProtocolLoop, emitUpdate } from './protocol.js';
import type { ProtocolContext } from './protocol.js';

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

// Register hooks on the agent for streaming events
agent.on('model_stream_chunk', (event: { data?: { delta?: string; text?: string } }) => {
  const delta = event.data?.delta ?? event.data?.text ?? '';
  if (delta) {
    emitUpdate({
      sessionUpdate: 'agent_message_chunk',
      text: delta,
      content: { type: 'text', text: delta },
    });
  }
});

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
      // Use invoke (not stream) — hooks handle event emission
      const result = await agent.invoke(userText);

      // Extract text from result and emit as a single chunk if hooks didn't fire
      const resultText = extractResultText(result);
      if (resultText) {
        emitUpdate({
          sessionUpdate: 'agent_message_chunk',
          text: resultText,
          content: { type: 'text', text: resultText },
        });
      }

      const metrics = result?.metrics;
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

function extractResultText(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const r = result as Record<string, unknown>;

  // Try result.message.content array
  if (r.message && typeof r.message === 'object') {
    const msg = r.message as Record<string, unknown>;
    if (Array.isArray(msg.content)) {
      const texts = msg.content
        .filter((b: unknown) => typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'text')
        .map((b: unknown) => (b as Record<string, unknown>).text as string)
        .filter(Boolean);
      if (texts.length > 0) return texts.join('');
    }
  }

  // Try result.text directly
  if (typeof r.text === 'string') return r.text;

  // Try result.output
  if (typeof r.output === 'string') return r.output;

  return '';
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
