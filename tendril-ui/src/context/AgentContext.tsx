import React, { createContext, useContext, useReducer, useEffect, useRef, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

const MAX_DEBUG_LOG_ENTRIES = 500;

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls: ToolCallEntry[];
  usage?: TokenUsageData;
}

export interface ToolCallEntry {
  toolCallId: string;
  title: string;
  kind: string;
  input: Record<string, unknown>;
  status: 'pending' | 'completed' | 'failed';
  output?: string;
}

export interface TokenUsageData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  durationMs: number;
}

export interface AgentState {
  messages: Message[];
  isProcessing: boolean;
  connectionStatus: 'connecting' | 'connected' | 'error' | 'disconnected' | 'reconnecting';
  error: string | null;
}

type AgentAction =
  | { type: 'ADD_USER_MESSAGE'; text: string }
  | { type: 'START_ASSISTANT_MESSAGE' }
  | { type: 'APPEND_TEXT'; text: string }
  | { type: 'ADD_TOOL_CALL'; toolCall: ToolCallEntry }
  | { type: 'UPDATE_TOOL_CALL'; toolCallId: string; status: string; output?: string }
  | { type: 'SET_USAGE'; usage: TokenUsageData }
  | { type: 'PROMPT_COMPLETE' }
  | { type: 'SET_CONNECTION_STATUS'; status: AgentState['connectionStatus'] }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' };

function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'user', text: action.text, toolCalls: [] },
        ],
        isProcessing: true,
        error: null,
      };

    case 'START_ASSISTANT_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'assistant', text: '', toolCalls: [] },
        ],
      };

    case 'APPEND_TEXT': {
      // State machine for text appending:
      // 1. No assistant message yet → ignore (START_ASSISTANT_MESSAGE should come first)
      // 2. Assistant message has NO completed tools → append to current text
      // 3. Assistant message has completed tools AND text is empty → append (post-tool response starting)
      // 4. Assistant message has completed tools AND text is non-empty → new bubble for post-tool response
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role !== 'assistant') return state;

      const hasCompletedTools = last.toolCalls.some((tc) => tc.status === 'completed');
      if (!hasCompletedTools || last.text === '') {
        // Cases 2 and 3: append to current message
        msgs[msgs.length - 1] = { ...last, text: last.text + action.text };
        return { ...state, messages: msgs };
      }
      // Case 4: start new bubble for post-tool response
      return {
        ...state,
        messages: [
          ...msgs,
          { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'assistant', text: action.text, toolCalls: [] },
        ],
      };
    }

    case 'ADD_TOOL_CALL': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, toolCalls: [...last.toolCalls, action.toolCall] };
      }
      return { ...state, messages: msgs };
    }

    case 'UPDATE_TOOL_CALL': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        const toolCalls = last.toolCalls.map((tc) =>
          tc.toolCallId === action.toolCallId
            ? { ...tc, status: action.status as ToolCallEntry['status'], output: action.output }
            : tc,
        );
        msgs[msgs.length - 1] = { ...last, toolCalls };
      }
      return { ...state, messages: msgs };
    }

    case 'SET_USAGE': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, usage: action.usage };
      }
      return { ...state, messages: msgs };
    }

    case 'PROMPT_COMPLETE':
      return { ...state, isProcessing: false };

    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.status };

    case 'SET_ERROR':
      return { ...state, error: action.error, isProcessing: false };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    default:
      return state;
  }
}

const initialState: AgentState = {
  messages: [],
  isProcessing: false,
  connectionStatus: 'connecting',
  error: null,
};

export interface DebugEntry {
  id: number;
  direction: string;
  message: unknown;
  timestamp?: string;
  /** True while this entry is an active chunk group being appended to */
  isChunkGroup?: boolean;
}

const AgentContext = createContext<{
  state: AgentState;
  dispatch: React.Dispatch<AgentAction>;
  debugLog: DebugEntry[];
}>({ state: initialState, dispatch: () => {}, debugLog: [] });

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(agentReducer, initialState);
  const [debugLog, setDebugLog] = useState<DebugEntry[]>([]);
  const debugCounterRef = useRef(0);
  const assistantStartedRef = useRef(false);

  // Single place for ALL Tauri event listeners — components just read state
  useEffect(() => {
    const controller = new AbortController();
    const cleanups: Array<() => void> = [];

    const setup = async () => {
      if (controller.signal.aborted) return;

      // Debug log collector
      // - Collapses all agent_message_chunk events into one growing entry
      // - Filters out stdout-guard stderr noise (redundant with chunk events)
      cleanups.push(await listen<{ direction: string; message: unknown; timestamp?: string }>(
        'agent-debug',
        (event) => {
          // Filter out stdout-guard noise
          if (event.payload.direction === 'agent-stderr') {
            const text = typeof event.payload.message === 'string' ? event.payload.message : '';
            if (text.includes('[stdout-guard]')) return;
          }

          const msg = event.payload.message as Record<string, unknown> | undefined;
          const update = (msg?.params as Record<string, unknown>)?.update as Record<string, unknown> | undefined;
          const isChunk = msg?.method === 'session/update' && update?.sessionUpdate === 'agent_message_chunk';

          setDebugLog((prev) => {
            if (isChunk) {
              const text = (update?.text as string) ?? '';
              // Find last active chunk group
              const lastChunkIdx = prev.findLastIndex((e) => e.isChunkGroup);
              if (lastChunkIdx >= 0) {
                const existing = prev[lastChunkIdx];
                const updated = { ...existing, message: (existing.message as string) + text, timestamp: event.payload.timestamp };
                const next = [...prev];
                next[lastChunkIdx] = updated;
                return next;
              }
              // Start new chunk group
              debugCounterRef.current += 1;
              return [
                ...prev.slice(-MAX_DEBUG_LOG_ENTRIES),
                { id: debugCounterRef.current, direction: 'agent→host', message: text, timestamp: event.payload.timestamp, isChunkGroup: true },
              ];
            }

            // On prompt_complete, close active chunk groups
            if (update?.sessionUpdate === 'prompt_complete') {
              const closed = prev.map((e) => {
                if (e.isChunkGroup) {
                  const { isChunkGroup: _, ...rest } = e;
                  return { ...rest, message: `📝 ${rest.message}` };
                }
                return e;
              });
              debugCounterRef.current += 1;
              return [
                ...closed.slice(-MAX_DEBUG_LOG_ENTRIES),
                { id: debugCounterRef.current, direction: event.payload.direction, message: event.payload.message, timestamp: event.payload.timestamp },
              ];
            }

            debugCounterRef.current += 1;
            return [
              ...prev.slice(-MAX_DEBUG_LOG_ENTRIES),
              { id: debugCounterRef.current, direction: event.payload.direction, message: event.payload.message, timestamp: event.payload.timestamp },
            ];
          });
        },
      ));

      if (controller.signal.aborted) { cleanups.forEach((fn) => fn()); return; }

      // Connection status events from Tauri backend
      cleanups.push(await listen<{ status: string; message?: string }>('connection-status', (event) => {
        const { status, message } = event.payload;
        if (status === 'connected') {
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
          dispatch({ type: 'CLEAR_ERROR' });
        } else if (status === 'disconnected') {
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'disconnected' });
          dispatch({ type: 'SET_ERROR', error: message ?? 'Agent disconnected' });
        } else if (status === 'reconnecting') {
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'reconnecting' });
          // Attempt reconnect from frontend
          invoke('connect_agent_cmd').catch(() => {
            // Reconnect failed — status will be updated by next event
          });
        } else if (status === 'error') {
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'error' });
          dispatch({ type: 'SET_ERROR', error: message ?? 'Connection error' });
        }
      }));

      if (controller.signal.aborted) { cleanups.forEach((fn) => fn()); return; }

      // Session lifecycle
      cleanups.push(await listen('session-lifecycle', (event: { payload: unknown }) => {
        const payload = event.payload as Record<string, unknown>;
        const stage = payload.stage as string | undefined;
        if (stage === 'connected') {
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
        } else if (stage === 'error' || stage === 'auth_failed') {
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'error' });
          dispatch({ type: 'SET_ERROR', error: (payload.error as string) ?? 'Connection failed' });
        }
      }));

      if (controller.signal.aborted) { cleanups.forEach((fn) => fn()); return; }

      // Agent errors
      cleanups.push(await listen('agent-error', (event: { payload: unknown }) => {
        const payload = event.payload as Record<string, unknown>;
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
        dispatch({ type: 'SET_ERROR', error: (payload.message as string) ?? 'Unknown error' });
      }));

      if (controller.signal.aborted) { cleanups.forEach((fn) => fn()); return; }

      // Streamed text chunks
      cleanups.push(await listen<{ text: string }>('agent-message-chunk', (event) => {
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
        if (!assistantStartedRef.current) {
          dispatch({ type: 'START_ASSISTANT_MESSAGE' });
          assistantStartedRef.current = true;
        }
        dispatch({ type: 'APPEND_TEXT', text: event.payload.text });
      }));

      if (controller.signal.aborted) { cleanups.forEach((fn) => fn()); return; }

      // Tool call announced
      cleanups.push(await listen<{ toolCallId: string; title: string; kind: string; input: Record<string, unknown> }>(
        'tool-call',
        (event) => {
          if (!assistantStartedRef.current) {
            dispatch({ type: 'START_ASSISTANT_MESSAGE' });
            assistantStartedRef.current = true;
          }
          dispatch({ type: 'ADD_TOOL_CALL', toolCall: { ...event.payload, status: 'pending' } });
        },
      ));

      if (controller.signal.aborted) { cleanups.forEach((fn) => fn()); return; }

      // Tool call completed
      cleanups.push(await listen<{ toolCallId: string; status: string; rawOutput?: string }>(
        'tool-call-update',
        (event) => {
          dispatch({
            type: 'UPDATE_TOOL_CALL',
            toolCallId: event.payload.toolCallId,
            status: event.payload.status,
            output: event.payload.rawOutput,
          });
        },
      ));

      if (controller.signal.aborted) { cleanups.forEach((fn) => fn()); return; }

      // Token usage
      cleanups.push(await listen<{ cost: number; input_tokens: number; output_tokens: number; total_tokens: number; duration_ms: number }>(
        'query-result',
        (event) => {
          dispatch({
            type: 'SET_USAGE',
            usage: {
              inputTokens: event.payload.input_tokens,
              outputTokens: event.payload.output_tokens,
              totalTokens: event.payload.total_tokens,
              cost: event.payload.cost,
              durationMs: event.payload.duration_ms,
            },
          });
        },
      ));

      if (controller.signal.aborted) { cleanups.forEach((fn) => fn()); return; }

      // Prompt complete — turn finished
      cleanups.push(await listen('prompt-complete', () => {
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
        dispatch({ type: 'PROMPT_COMPLETE' });
        assistantStartedRef.current = false;
      }));
    };

    setup();
    return () => {
      controller.abort();
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return <AgentContext.Provider value={{ state, dispatch, debugLog }}>{children}</AgentContext.Provider>;
}

export function useAgentState() {
  return useContext(AgentContext);
}
