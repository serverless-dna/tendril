import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRequest, emitUpdate } from '../src/transport/protocol';
import type { ProtocolContext } from '../src/transport/protocol';
import type { AcpRequest } from '../src/types';

let output: string[];
let ctx: ProtocolContext;

beforeEach(() => {
  output = [];
  // Capture stdout writes
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    output.push(chunk.toString().trim());
    return true;
  });

  ctx = {
    sessionId: null,
    onPrompt: vi.fn(async () => {}),
    onCancel: vi.fn(),
  };
});

function parseOutput(): Array<Record<string, unknown>> {
  return output.filter((l) => l).map((l) => JSON.parse(l));
}

describe('handleRequest', () => {
  it('responds to initialize with agent info', async () => {
    const req: AcpRequest = {
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: { protocolVersion: '1.0.0', clientInfo: { name: 'test', version: '0.1.0' }, capabilities: {} },
    };

    await handleRequest(req, ctx);

    const msgs = parseOutput();
    const response = msgs.find((m) => (m as { id?: string }).id === 'init-1');
    expect(response).toBeDefined();
    expect((response as { result?: { agentInfo?: { name: string } } }).result?.agentInfo?.name).toBe('tendril-agent');
  });

  it('responds to new_session with sessionId and emits connected', async () => {
    const req: AcpRequest = {
      jsonrpc: '2.0',
      id: 'session-1',
      method: 'new_session',
      params: { workingDirectory: '/tmp/test' },
    };

    await handleRequest(req, ctx);

    const msgs = parseOutput();
    const response = msgs.find((m) => (m as { id?: string }).id === 'session-1');
    expect(response).toBeDefined();
    expect((response as { result?: { sessionId?: string } }).result?.sessionId).toBeDefined();

    const connected = msgs.find(
      (m) =>
        (m as { method?: string }).method === 'session/update' &&
        ((m as { params?: { update?: { stage?: string } } }).params?.update?.stage === 'connected'),
    );
    expect(connected).toBeDefined();
    expect(ctx.sessionId).toBeDefined();
  });

  it('responds to prompt immediately and calls onPrompt', async () => {
    const req: AcpRequest = {
      jsonrpc: '2.0',
      id: 'prompt-1',
      method: 'prompt',
      params: { sessionId: 'test-session', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] },
    };

    await handleRequest(req, ctx);

    const msgs = parseOutput();
    const response = msgs.find((m) => (m as { id?: string }).id === 'prompt-1');
    expect(response).toBeDefined();
    expect(ctx.onPrompt).toHaveBeenCalled();
  });

  it('calls onCancel for notifications/cancelled', async () => {
    const req: AcpRequest = {
      jsonrpc: '2.0',
      id: '',
      method: 'notifications/cancelled',
      params: { requestId: 'prompt-1' },
    };

    await handleRequest(req, ctx);
    expect(ctx.onCancel).toHaveBeenCalledWith('prompt-1');
  });

  it('returns error for unknown method', async () => {
    const req: AcpRequest = {
      jsonrpc: '2.0',
      id: 'unknown-1',
      method: 'unknown_method',
      params: {},
    };

    await handleRequest(req, ctx);

    const msgs = parseOutput();
    const response = msgs.find((m) => (m as { id?: string }).id === 'unknown-1');
    expect(response).toBeDefined();
    expect((response as { error?: { code: number } }).error?.code).toBe(-32601);
  });
});
