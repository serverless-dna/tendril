import { useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useAgentState } from '../context/AgentContext';

export function useAgent() {
  const { state, dispatch } = useAgentState();
  const assistantStarted = useRef(false);

  useEffect(() => {
    const unlisten: Array<() => void> = [];

    const setup = async () => {
      unlisten.push(
        await listen<{ text: string }>('agent-message-chunk', (event) => {
          if (!assistantStarted.current) {
            dispatch({ type: 'START_ASSISTANT_MESSAGE' });
            assistantStarted.current = true;
          }
          dispatch({ type: 'APPEND_TEXT', text: event.payload.text });
        }),
      );

      unlisten.push(
        await listen<{ toolCallId: string; title: string; kind: string; input: Record<string, unknown> }>(
          'tool-call',
          (event) => {
            if (!assistantStarted.current) {
              dispatch({ type: 'START_ASSISTANT_MESSAGE' });
              assistantStarted.current = true;
            }
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
          assistantStarted.current = false;
        }),
      );
    };

    setup();
    return () => { unlisten.forEach((fn) => fn()); };
  }, [dispatch]);

  const sendPrompt = useCallback(async (text: string) => {
    assistantStarted.current = false;
    dispatch({ type: 'ADD_USER_MESSAGE', text });
    await invoke('send_prompt', { text });
  }, [dispatch]);

  const cancelPrompt = useCallback(async () => {
    await invoke('cancel_prompt');
  }, []);

  return { ...state, sendPrompt, cancelPrompt };
}
