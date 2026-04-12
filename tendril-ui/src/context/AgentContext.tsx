import React, { createContext, useContext, useReducer, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

let msgCounter = 0;
function nextMsgId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

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
  connectionStatus: 'connecting' | 'connected' | 'error' | 'disconnected';
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
          { id: nextMsgId(), role: 'user', text: action.text, toolCalls: [] },
        ],
        isProcessing: true,
        error: null,
      };

    case 'START_ASSISTANT_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: nextMsgId(), role: 'assistant', text: '', toolCalls: [] },
        ],
      };

    case 'APPEND_TEXT': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, text: last.text + action.text };
      }
      return { ...state, messages: msgs };
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

  // Listen for ALL events at provider level so we never miss them
  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    // Debug event collector — always active
    listen<{ direction: string; message: unknown; timestamp?: string }>(
      'agent-debug',
      (event) => {
        debugCounterRef.current += 1;
        setDebugLog((prev) => [
          ...prev.slice(-500),
          {
            id: debugCounterRef.current,
            direction: event.payload.direction,
            message: event.payload.message,
            timestamp: event.payload.timestamp,
          },
        ]);
      },
    ).then((fn) => { if (!cancelled) cleanups.push(fn); });

    const setup = async () => {
      const unlistenLifecycle = await listen('session-lifecycle', (event: { payload: unknown }) => {
        console.log('[AgentProvider] session-lifecycle payload:', JSON.stringify(event.payload));
        const payload = event.payload as Record<string, unknown>;
        const stage = payload.stage as string | undefined;
        if (stage === 'connected') {
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
        } else if (stage === 'error' || stage === 'auth_failed') {
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'error' });
          dispatch({ type: 'SET_ERROR', error: (payload.error as string) ?? 'Connection failed' });
        }
      });
      if (!cancelled) cleanups.push(unlistenLifecycle);

      const unlistenError = await listen('agent-error', (event: { payload: unknown }) => {
        console.log('[AgentProvider] agent-error payload:', JSON.stringify(event.payload));
        const payload = event.payload as Record<string, unknown>;
        // If we're getting errors from the agent, it's connected (error is from inference, not handshake)
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
        dispatch({ type: 'SET_ERROR', error: (payload.message as string) ?? 'Unknown error' });
      });
      if (!cancelled) cleanups.push(unlistenError);

      // Also listen to any agent-originated event as proof of connection
      const unlistenChunk = await listen('agent-message-chunk', () => {
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
      });
      if (!cancelled) cleanups.push(unlistenChunk);

      const unlistenComplete = await listen('prompt-complete', () => {
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
        dispatch({ type: 'PROMPT_COMPLETE' });
      });
      if (!cancelled) cleanups.push(unlistenComplete);
    };

    setup();
    return () => { cancelled = true; cleanups.forEach((fn) => fn()); };
  }, []);

  return <AgentContext.Provider value={{ state, dispatch, debugLog }}>{children}</AgentContext.Provider>;
}

export function useAgentState() {
  return useContext(AgentContext);
}
