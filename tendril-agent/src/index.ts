/**
 * Tendril Agent — entry point.
 *
 * Architecture:
 *   loop/       — the agentic loop: tools, prompt, registry, sandbox
 *   transport/  — ACP protocol (conversation framing) + stream observer
 *
 * The agentic loop runs inside agent.stream(). This file wires the two
 * layers together: each user prompt triggers agent.stream(), and the
 * stream observer classifies SDK events into loop phases (think → act →
 * observe → repeat) and forwards them to the UI as SessionUpdate messages.
 */

import { readConfig } from './config.js';
import { createAgent } from './agent.js';
import { writeSystemPrompt } from './loop/prompt.js';
import { startProtocolLoop, emitUpdate } from './transport/protocol.js';
import type { ProtocolContext } from './transport/protocol.js';
import { classifyEvent, handleThink, handleAct, handleObserve, handleMetadata } from './transport/stream.js';
import { classifyError } from './transport/errors.js';
import { PROVIDER_COSTS, getActiveModelId } from './costs.js';

// ── Stdout guard ────────────────────────────────────────────────────────────
// The ACP protocol requires stdout to carry only JSON-RPC messages.
// Strands SDK sometimes writes raw text to stdout despite the nullPrinter.
// This guard redirects any non-JSON stdout writes to stderr as diagnostics.
// TODO: Remove when SDK provides a clean way to suppress all stdout output.
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function(chunk: string | Uint8Array, ...args: unknown[]): boolean {
  const str = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
  const trimmed = str.trim();
  if (trimmed && !trimmed.startsWith('{')) {
    process.stderr.write(`[stdout-guard] ${trimmed}\n`);
    return true;
  }
  return originalStdoutWrite(chunk, ...(args as [BufferEncoding, () => void]));
} as typeof process.stdout.write;

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const workspaceArg = process.argv[2] || undefined;
  const { config, workspace: workspacePath } = await readConfig(workspaceArg, workspaceArg);

  const provider = config.model.provider;
  const modelId = getActiveModelId(config);
  const costs = PROVIDER_COSTS[provider];

  logStartup(config, workspacePath, provider, modelId);
  await writeSystemPrompt(workspacePath);

  const agent = createAgent(config, workspacePath);

  const ctx: ProtocolContext = {
    sessionId: null,

    async onPrompt(_sessionId: string, messages: unknown[]) {
      const userText = extractTextContent(messages);
      if (!userText) {
        emitUpdate({ sessionUpdate: 'prompt_complete', stop_reason: 'end_turn' });
        return;
      }

      const turn = createTurnTracker();

      try {
        // ── Agentic loop — observe each phase ──────────────────────────
        for await (const event of agent.stream(userText)) {
          const { phase, event: e } = classifyEvent(event);

          switch (phase) {
            case 'think': {
              const update = handleThink(e);
              if (update) emitUpdate(update);
              break;
            }
            case 'act': {
              const { update, toolCallId } = handleAct(e, turn.toolCount);
              emitUpdate(update);
              // Yield to the event loop so the pipe flushes the tool_call
              // event before the SDK resumes and starts tool execution.
              await new Promise((r) => setImmediate(r));
              turn.lastToolId = toolCallId;
              turn.toolCount++;
              break;
            }
            case 'observe': {
              emitUpdate(handleObserve(e, turn.lastToolId, turn.toolCount));
              break;
            }
            case 'metadata': {
              turn.usage = handleMetadata(e) ?? turn.usage;
              break;
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[tendril-agent] Error: ${message}\n`);
        const userMessage = classifyError(message, provider, modelId, config.model.ollama?.host);
        emitUpdate({ sessionUpdate: 'error', message: userMessage });
      }

      emitTurnEnd(turn, costs);
    },

    onCancel(_requestId: string) {
      agent.cancel();
    },
  };

  startProtocolLoop(ctx);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface TurnTracker {
  startTime: number;
  toolCount: number;
  lastToolId: string;
  usage: { inputTokens: number; outputTokens: number };
}

function createTurnTracker(): TurnTracker {
  return {
    startTime: Date.now(),
    toolCount: 0,
    lastToolId: '',
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

function extractTextContent(messages: unknown[]): string {
  const lastMessage = (messages as Array<{ role: string; content: unknown[] }>).at(-1);
  const content = lastMessage?.content;
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

function emitTurnEnd(turn: TurnTracker, costs: { inputCostPerToken: number; outputCostPerToken: number; contextLimit: number }): void {
  const durationMs = Date.now() - turn.startTime;
  const { inputTokens, outputTokens } = turn.usage;
  const totalTokens = inputTokens + outputTokens;

  emitUpdate({
    sessionUpdate: 'query_result',
    cost: inputTokens * costs.inputCostPerToken + outputTokens * costs.outputCostPerToken,
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

function logStartup(config: import('./config.js').WorkspaceConfig, workspacePath: string, provider: string, modelId: string): void {
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
}

main().catch((err) => {
  process.stderr.write(`[tendril-agent] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
