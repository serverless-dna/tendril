import React, { useState } from 'react';

interface SettingsConfig {
  model: { modelId: string; region: string; profile?: string };
  sandbox: { timeoutMs: number };
  agent: { maxTurns: number };
}

interface SettingsPanelProps {
  config: SettingsConfig;
  systemPrompt: string;
  onSave: (config: SettingsConfig) => void;
}

export function SettingsPanel({ config, systemPrompt, onSave }: SettingsPanelProps) {
  const [modelId, setModelId] = useState(config.model.modelId);
  const [region, setRegion] = useState(config.model.region);
  const [profile, setProfile] = useState(config.model.profile ?? '');
  const [timeoutMs, setTimeoutMs] = useState(config.sandbox.timeoutMs);
  const [maxTurns, setMaxTurns] = useState(config.agent.maxTurns);

  const handleSave = () => {
    onSave({
      model: { modelId, region, profile: profile || undefined },
      sandbox: { timeoutMs },
      agent: { maxTurns },
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Model ID
          </label>
          <input
            type="text"
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
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="default"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
          />
          <p className="text-xs text-gray-400 mt-1">Leave blank to use the default credential chain</p>
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

        <button
          onClick={handleSave}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Save Settings
        </button>

        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            System Prompt
          </h3>
          <pre className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-auto text-gray-600 dark:text-gray-400">
            {systemPrompt}
          </pre>
        </div>
      </div>
    </div>
  );
}
