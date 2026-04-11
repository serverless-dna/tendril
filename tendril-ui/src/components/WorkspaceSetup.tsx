import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

interface WorkspaceSetupProps {
  onInit: (path: string) => Promise<void>;
}

export function WorkspaceSetup({ onInit }: WorkspaceSetupProps) {
  const [path, setPath] = useState('~/tendril-workspace');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleBrowse = async () => {
    const selected = await open({ directory: true, multiple: false, title: 'Choose workspace directory' });
    if (selected) {
      setPath(selected as string);
    }
  };

  const handleInit = async () => {
    setStatus('loading');
    try {
      await onInit(path.trim());
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md w-full p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Welcome to Tendril</h1>
        <p className="text-sm text-gray-500 mb-6">
          Choose a directory for your workspace. Tendril will create a capability registry and tools directory here.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Workspace Path
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
            <button
              onClick={handleBrowse}
              className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Browse
            </button>
          </div>
        </div>

        <button
          onClick={handleInit}
          disabled={!path.trim() || status === 'loading'}
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {status === 'loading' ? 'Creating...' : 'Initialize Workspace'}
        </button>

        {status === 'success' && (
          <p className="mt-3 text-sm text-green-600">Workspace created successfully!</p>
        )}
        {status === 'error' && (
          <p className="mt-3 text-sm text-red-600">{errorMsg}</p>
        )}
      </div>
    </div>
  );
}
