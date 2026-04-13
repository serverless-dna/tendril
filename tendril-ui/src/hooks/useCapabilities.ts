import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Capability } from '../types';

export function useCapabilities(workspacePath: string) {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<Capability[]>('read_capabilities', { path: workspacePath });
      setCapabilities(result);
    } catch {
      setCapabilities([]);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  return { capabilities, loading, refresh };
}
