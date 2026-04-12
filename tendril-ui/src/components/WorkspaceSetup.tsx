import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

interface WorkspaceSetupProps {
  onInit: (path: string) => Promise<void>;
}

export function WorkspaceSetup({ onInit }: WorkspaceSetupProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleChooseFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Choose a folder for your Tendril workspace',
    });

    if (!selected) return;

    const path = selected as string;
    setSelectedPath(path);
    setStatus('loading');

    try {
      await onInit(path);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex items-center justify-center h-full bg-gray-950">
      <div className="max-w-lg w-full p-12 text-center">
        <div className="text-5xl mb-6">🌱</div>
        <h1 className="text-3xl font-bold text-gray-100 mb-3">Welcome to Tendril</h1>
        <p className="text-gray-400 mb-8">
          Pick a folder to use as your workspace. Tendril will create a capability
          registry and tools directory inside it.
        </p>

        {status === 'idle' && (
          <button
            onClick={handleChooseFolder}
            className="rounded-lg bg-blue-600 px-8 py-3 text-base font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Choose Workspace Folder
          </button>
        )}

        {status === 'loading' && (
          <div className="text-gray-400">
            <div className="animate-pulse text-lg">Setting up workspace...</div>
            {selectedPath && (
              <div className="text-sm text-gray-500 mt-2 font-mono">{selectedPath}</div>
            )}
          </div>
        )}

        {status === 'success' && (
          <div>
            <div className="text-green-400 text-lg mb-2">Workspace ready!</div>
            <div className="text-sm text-gray-500 font-mono">{selectedPath}</div>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div className="text-red-400 text-sm mb-4">{errorMsg}</div>
            <button
              onClick={() => { setStatus('idle'); setErrorMsg(''); }}
              className="rounded-lg border border-gray-600 px-6 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
