import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAgentState } from '../context/AgentContext';

export function useAgent() {
  const { state, dispatch } = useAgentState();

  const sendPrompt = useCallback(async (text: string) => {
    dispatch({ type: 'ADD_USER_MESSAGE', text });
    await invoke('send_prompt', { text });
  }, [dispatch]);

  const cancelPrompt = useCallback(async () => {
    await invoke('cancel_prompt');
  }, []);

  return { ...state, sendPrompt, cancelPrompt };
}
