import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAgentState } from '../context/AgentContext';

export function useSession() {
  const { state, dispatch } = useAgentState();

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<{ stage: string; error?: string }>('session-lifecycle', (event) => {
      switch (event.payload.stage) {
        case 'connected':
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' });
          break;
        case 'error':
        case 'auth_failed':
          dispatch({ type: 'SET_CONNECTION_STATUS', status: 'error' });
          dispatch({ type: 'SET_ERROR', error: event.payload.error ?? 'Connection failed' });
          break;
      }
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [dispatch]);

  return {
    connectionStatus: state.connectionStatus,
    error: state.error,
  };
}
