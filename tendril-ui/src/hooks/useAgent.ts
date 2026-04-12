import { useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useAgentState } from '../context/AgentContext';

export function useAgent() {
  const { state, dispatch } = useAgentState();

  useEffect(() => {
    const unlisten: Array<() => void> = [];

    const setup = async () => {
      unlisten.push(
        await listen<{ text: string }>('agent-message-chunk', (event) => {
          if (state.messages.length === 0 || state.messages[state.messages.length - 1]?.role !== 'assistant') {
            dispatch({ type: 'START_ASSISTANT_MESSAGE' });
          }
          dispatch({ type: 'APPEND_TEXT', text: event.payload.text });
        }),
      );

      unlisten.push(
        await listen<{ toolCallId: string; title: string; kind: string; input: Record<string, unknown> }>(
          'tool-call',
          (event) => {
            dispatch({
              type: 'ADD_TOOL_CALL',
              toolCall: { ...event.payload, status: 'pending' },
            });
          },
        ),
      );

      unlisten.push(
        await listen<{ toolCallId: string; status: string; rawOutput?: string }>(
          'tool-call-update',
          (event) => {
            dispatch({
              type: 'UPDATE_TOOL_CALL',
              toolCallId: event.payload.toolCallId,
              status: event.payload.status,
              output: event.payload.rawOutput,
            });
          },
        ),
      );

      unlisten.push(
        await listen<{ cost: number; input_tokens: number; output_tokens: number; total_tokens: number; duration_ms: number }>(
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
        ),
      );

      unlisten.push(
        await listen('prompt-complete', () => {
          dispatch({ type: 'PROMPT_COMPLETE' });
        }),
      );

      unlisten.push(
        await listen<{ stage?: string; sessionUpdate?: string; error?: string; agent_info?: string }>('session-lifecycle', (event) => {
          const stage = event.payload.stage;
          if (stage === 'connected') {
            dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
          } else if (stage === 'error' || stage === 'auth_failed') {
            dispatch({ type: 'SET_ERROR', error: event.payload.error ?? 'Connection failed' });
            dispatch({ type: 'SET_CONNECTION_STATUS', status: 'error' });
          }
        }),
      );

      unlisten.push(
        await listen<{ message?: string; sessionUpdate?: string }>('agent-error', (event) => {
          dispatch({ type: 'SET_ERROR', error: event.payload.message ?? 'Unknown error' });
        }),
      );

      // Check if we missed the connected event (race condition on startup)
      // Give the agent 2s to connect, then check
      setTimeout(() => {
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
      }, 2000);
    };

    setup();
    return () => { unlisten.forEach((fn) => fn()); };
  }, []);

  const sendPrompt = useCallback(async (text: string) => {
    dispatch({ type: 'ADD_USER_MESSAGE', text });
    dispatch({ type: 'START_ASSISTANT_MESSAGE' });
    await invoke('send_prompt', { text });
  }, [dispatch]);

  const cancelPrompt = useCallback(async () => {
    await invoke('cancel_prompt');
  }, []);

  return { ...state, sendPrompt, cancelPrompt };
}
