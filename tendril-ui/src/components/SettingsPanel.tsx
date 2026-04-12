import React, { useState } from 'react';

interface SettingsConfig {
  workspace?: string;
  model: { modelId: string; region: string; profile?: string };
  sandbox: { timeoutMs: number };
  agent: { maxTurns: number };
}

interface SettingsPanelProps {
  config: SettingsConfig;
  systemPrompt: string;
  onSave: (config: Partial<SettingsConfig>) => void;
}

export function SettingsPanel({ config, systemPrompt, onSave }: SettingsPanelProps) {
  const [modelId, setModelId] = useState(config.model?.modelId ?? '');
  const [region, setRegion] = useState(config.model?.region ?? '');
  const [profile, setProfile] = useState(config.model?.profile ?? '');
  const [timeoutMs, setTimeoutMs] = useState(config.sandbox?.timeoutMs ?? 45000);
  const [maxTurns, setMaxTurns] = useState(config.agent?.maxTurns ?? 100);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave({
      model: { modelId, region, profile: profile || undefined },
      sandbox: { timeoutMs },
      agent: { maxTurns },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Workspace (read-only) */}
        {config.workspace && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Workspace
            </label>
            <div className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-900 dark:border-gray-600 text-gray-500 dark:text-gray-400 font-mono">
              {config.workspace}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Model ID
          </label>
          <input
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            AWS Region
          </label>
          <input
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            AWS Profile
          </label>
          <input
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="default"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
          />
          <p className="text-xs text-gray-400 mt-1">
            AWS credentials profile from ~/.aws/credentials
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Sandbox Timeout (ms)
          </label>
          <input
            type="number"
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Max Agent Turns
          </label>
          <input
            type="number"
            value={maxTurns}
            onChange={(e) => setMaxTurns(Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Save & Restart Agent
          </button>
          {saved && <span className="text-sm text-green-400">Saved!</span>}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            System Prompt
          </h3>
          <pre className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-auto text-gray-600 dark:text-gray-400">
            {systemPrompt}
          </pre>
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-600 pt-2">
          Config: ~/.tendril/config.json
        </div>
      </div>
    </div>
  );
}
