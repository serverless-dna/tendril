/**
 * ACP Protocol — JSON-RPC transport between Tauri shell and this sidecar.
 *
 * This is the conversation loop (user → agent → user), NOT the agentic loop.
 * The agentic loop (think → act → observe → repeat) runs inside agent.stream()
 * and is observed via the stream handler in ./stream.ts.
 */

import * as readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import type { AcpRequest, SessionUpdate } from '../types.js';

export interface ProtocolContext {
  sessionId: string | null;
  onPrompt: (sessionId: string, messages: unknown[]) => Promise<void>;
  onCancel: (requestId: string) => void;
}

function emit(msg: Record<string, unknown>): void {
  const data = JSON.stringify(msg) + '\n';
  // Write and check if the kernel buffer accepted the data.
  // If write() returns false, the data is queued internally by Node
  // but will still be flushed before the process yields to I/O.
  process.stdout.write(data);
}

export function emitUpdate(update: SessionUpdate): void {
  emit({
    jsonrpc: '2.0',
    method: 'session/update',
    params: { update },
  });
}

function emitResponse(id: string, result: Record<string, unknown> = {}): void {
  emit({ jsonrpc: '2.0', id, result });
}

function emitError(id: string, code: number, message: string): void {
  emit({ jsonrpc: '2.0', id, error: { code, message } });
}

function handleInitialize(req: AcpRequest): void {
  emitResponse(req.id, {
    agentInfo: { name: 'tendril-agent', version: '0.1.0' },
    authMethods: [],
  });
}

function handleNewSession(req: AcpRequest, ctx: ProtocolContext): void {
  const sessionId = randomUUID();
  ctx.sessionId = sessionId;

  emitResponse(req.id, { sessionId });

  emitUpdate({
    sessionUpdate: 'session_lifecycle',
    stage: 'connected',
    agent_info: 'tendril-agent',
    acp_session_id: sessionId,
    is_restored: false,
  });
}

async function handlePrompt(req: AcpRequest, ctx: ProtocolContext): Promise<void> {
  emitResponse(req.id);

  const params = req.params as { sessionId?: string; messages?: unknown[] };
  const sessionId = params.sessionId ?? ctx.sessionId ?? 'unknown';
  const messages = params.messages ?? [];

  await ctx.onPrompt(sessionId, messages);
}

function handleCancel(params: Record<string, unknown>, ctx: ProtocolContext): void {
  const requestId = (params.requestId as string) ?? 'unknown';
  ctx.onCancel(requestId);
}

export async function handleRequest(req: AcpRequest, ctx: ProtocolContext): Promise<void> {
  switch (req.method) {
    case 'initialize':
      handleInitialize(req);
      break;
    case 'new_session':
      handleNewSession(req, ctx);
      break;
    case 'prompt':
      await handlePrompt(req, ctx);
      break;
    case 'notifications/cancelled':
      handleCancel(req.params, ctx);
      break;
    default:
      if (req.id) {
        emitError(req.id, -32601, `Method not found: ${req.method}`);
      }
  }
}

export function startProtocolLoop(ctx: ProtocolContext): void {
  const rl = readline.createInterface({ input: process.stdin });
  let promptInFlight = false;

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg: unknown;
    try {
      msg = JSON.parse(trimmed);
    } catch (err) {
      process.stderr.write(`Protocol error: invalid JSON: ${err instanceof Error ? err.message : String(err)}\n`);
      return;
    }

    try {
      const parsed = msg as Record<string, unknown>;

      if (parsed.method === 'notifications/cancelled') {
        handleCancel((parsed.params as Record<string, unknown>) ?? {}, ctx);
        return;
      }

      if (parsed.id && parsed.method) {
        const req = parsed as unknown as AcpRequest;

        // Serialize prompt handling — reject concurrent prompts
        if (req.method === 'prompt') {
          if (promptInFlight) {
            emitError(req.id, -32000, 'Prompt already in progress');
            return;
          }
          promptInFlight = true;
          try {
            await handleRequest(req, ctx);
          } finally {
            promptInFlight = false;
          }
        } else {
          await handleRequest(req, ctx);
        }
      }
    } catch (err) {
      process.stderr.write(`Protocol error: ${err}\n`);
    }
  });

  rl.on('close', () => {
    process.stderr.write('stdin closed — shutting down\n');
    process.exit(0);
  });
}
