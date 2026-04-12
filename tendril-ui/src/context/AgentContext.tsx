import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

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
          { id: `msg-${Date.now()}`, role: 'user', text: action.text, toolCalls: [] },
        ],
        isProcessing: true,
        error: null,
      };

    case 'START_ASSISTANT_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: `msg-${Date.now()}`, role: 'assistant', text: '', toolCalls: [] },
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

const AgentContext = createContext<{
  state: AgentState;
  dispatch: React.Dispatch<AgentAction>;
}>({ state: initialState, dispatch: () => {} });

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(agentReducer, initialState);

  // Listen for lifecycle events at provider level so we never miss them
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    listen<{ stage?: string; error?: string }>('session-lifecycle', (event) => {
      const stage = event.payload.stage;
      if (stage === 'connected') {
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
      } else if (stage === 'error' || stage === 'auth_failed') {
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'error' });
        dispatch({ type: 'SET_ERROR', error: event.payload.error ?? 'Connection failed' });
      }
    }).then((fn) => cleanups.push(fn));

    listen<{ message?: string }>('agent-error', (event) => {
      dispatch({ type: 'SET_ERROR', error: event.payload.message ?? 'Unknown error' });
    }).then((fn) => cleanups.push(fn));

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return <AgentContext.Provider value={{ state, dispatch }}>{children}</AgentContext.Provider>;
}

export function useAgentState() {
  return useContext(AgentContext);
}
