import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAgentState } from '../context/AgentContext';

export function useAgent() {
  const { state, dispatch } = useAgentState();

  const sendPrompt = useCallback(async (text: string) => {
    dispatch({ type: 'ADD_USER_MESSAGE', text });
    try {
      await invoke('send_prompt', { text });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  }, [dispatch]);

  const cancelPrompt = useCallback(async () => {
    try {
      await invoke('cancel_prompt');
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  }, [dispatch]);

  return { ...state, sendPrompt, cancelPrompt };
}
