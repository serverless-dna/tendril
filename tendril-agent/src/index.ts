import { readConfig } from './config.js';
import { createAgent, createModel } from './agent.js';
import { writeSystemPrompt } from './prompt.js';
import { startProtocolLoop, emitUpdate } from './protocol.js';
import type { ProtocolContext } from './protocol.js';
import { PROVIDER_COSTS, getActiveModelId } from './costs.js';

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

async function main() {
  // Workspace can be passed as arg or read from ~/.tendril/config.json
  const workspaceArg = process.argv[2] || undefined;
  const { config, workspace: workspacePath } = await readConfig(workspaceArg);

  const provider = config.model.provider;
  const modelId = getActiveModelId(config);
  const costs = PROVIDER_COSTS[provider];

  // Provider-aware startup logging (FR-012)
  process.stderr.write(`[tendril-agent] workspace: ${workspacePath}\n`);
  process.stderr.write(`[tendril-agent] provider: ${provider}\n`);
  process.stderr.write(`[tendril-agent] model: ${modelId}\n`);
  process.stderr.write(`[tendril-agent] deno: ${config.sandbox.denoPath}\n`);
  if (provider === 'bedrock' && config.model.bedrock?.region) {
    process.stderr.write(`[tendril-agent] region: ${config.model.bedrock.region}\n`);
  }
  if (provider === 'bedrock' && config.model.bedrock?.profile) {
    process.stderr.write(`[tendril-agent] AWS profile: ${config.model.bedrock.profile}\n`);
  }
  if (provider === 'ollama' && config.model.ollama?.host) {
    process.stderr.write(`[tendril-agent] ollama host: ${config.model.ollama.host}\n`);
  }

  // Write system prompt to shared file for Rust backend to read
  await writeSystemPrompt(workspacePath);

  const agent = createAgent(config, workspacePath);

  let turnStartTime = 0;
  let turnToolCallCounter = 0;
  let lastUsage: { inputTokens: number; outputTokens: number } | null = null;

  const ctx: ProtocolContext = {
    sessionId: null,

    async onPrompt(_sessionId: string, messages: unknown[]) {
      turnStartTime = Date.now();
      turnToolCallCounter = 0;
      // Track tool call ID per-turn, not module-level
      let currentToolCallId = '';

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
          currentToolCallId = handleStreamEvent(event, turnToolCallCounter, currentToolCallId);
          // Update counter if a new tool call was announced
          if (event && typeof event === 'object' && (event as unknown as Record<string, unknown>).type === 'beforeToolCallEvent') {
            turnToolCallCounter++;
          }
        }

        emitTurnEnd();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[tendril-agent] Error: ${message}\n`);

        // Provider-generic error handling
        if (provider === 'ollama' && isOllamaConnectionError(message)) {
          const host = config.model.ollama?.host ?? 'unknown';
          emitUpdate({ sessionUpdate: 'error', message: `Ollama is not running or unreachable at ${host}` });
        } else if (provider === 'ollama' && isOllamaModelNotFound(message)) {
          emitUpdate({ sessionUpdate: 'error', message: `Model ${modelId} not found in Ollama. Run: ollama pull ${modelId}` });
        } else if (isAuthError(message)) {
          emitUpdate({ sessionUpdate: 'error', message: `${provider} authentication failed: ${message}` });
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

  function handleStreamEvent(event: unknown, toolCounter: number, lastToolId: string): string {
    if (!event || typeof event !== 'object') return lastToolId;
    const e = event as Record<string, unknown>;
    const type = (e.type as string) ?? e.constructor?.name ?? 'unknown';

    // modelStreamUpdateEvent — nested at event.event.delta.text
    if (type === 'modelStreamUpdateEvent') {
      const inner = e.event as Record<string, unknown> | undefined;
      if (!inner) return lastToolId;
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
        return lastToolId;
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
        return lastToolId;
      }

      return lastToolId;
    }

    // Tool call announced — beforeToolCallEvent
    if (type === 'beforeToolCallEvent') {
      const toolUse = (e.toolUse as Record<string, unknown>) ?? e;
      const toolCallId = (toolUse.toolUseId as string) ?? `tool-${toolCounter + 1}`;
      emitUpdate({
        sessionUpdate: 'tool_call',
        toolCallId,
        title: (toolUse.name as string) ?? 'unknown',
        kind: (toolUse.name as string) === 'execute' ? 'execute' : 'other',
        input: toolUse.input ?? {},
      });
      return toolCallId;
    }

    // Tool result — toolResultEvent / afterToolCallEvent
    if (type === 'toolResultEvent' || type === 'afterToolCallEvent') {
      const result = (e.result as Record<string, unknown>) ?? e;
      const rawOutput = result.content ?? result.result ?? result.text ?? '';
      emitUpdate({
        sessionUpdate: 'tool_call_update',
        toolCallId: lastToolId || `tool-${toolCounter}`,
        status: 'completed',
        rawOutput: typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput),
        title: (e.name as string) ?? 'unknown',
      });
      return lastToolId;
    }

    return lastToolId;
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

    const inputCost = inputTokens * costs.inputCostPerToken;
    const outputCost = outputTokens * costs.outputCostPerToken;

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
      context_limit: costs.contextLimit,
    });

    emitUpdate({
      sessionUpdate: 'prompt_complete',
      stop_reason: 'end_turn',
    });
  }

  function isAuthError(message: string): boolean {
    const authPatterns = ['UnrecognizedClientException', 'AccessDeniedException', 'ExpiredTokenException', 'credentials', 'security token', 'Incorrect API key', '401', 'authentication_error'];
    return authPatterns.some((p) => message.toLowerCase().includes(p.toLowerCase()));
  }

  function isOllamaConnectionError(message: string): boolean {
    const patterns = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'fetch failed', 'network error'];
    return patterns.some((p) => message.toLowerCase().includes(p.toLowerCase()));
  }

  function isOllamaModelNotFound(message: string): boolean {
    return message.includes('404') || message.toLowerCase().includes('model') && message.toLowerCase().includes('not found');
  }

  startProtocolLoop(ctx);
}

main().catch((err) => {
  process.stderr.write(`[tendril-agent] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
