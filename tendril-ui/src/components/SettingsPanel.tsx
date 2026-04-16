import React, { useState, useRef, useEffect } from 'react';
import type { AppConfig, Provider } from '../types';

interface SettingsPanelProps {
  config: AppConfig;
  systemPrompt: string;
  onSave: (config: Partial<AppConfig>) => Promise<void>;
  /** Check if an API key exists in Stronghold for a provider */
  hasApiKey?: (provider: string) => Promise<boolean>;
  /** Save an API key to Stronghold for a provider */
  saveApiKey?: (provider: string, apiKey: string) => Promise<void>;
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'bedrock', label: 'AWS Bedrock' },
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
];

const OLLAMA_DEFAULTS = { host: 'http://localhost:11434', modelId: 'llama3' };
const BEDROCK_DEFAULTS = { modelId: 'us.anthropic.claude-sonnet-4-5-20250514', region: 'us-east-1' };
const OPENAI_DEFAULTS = { modelId: 'gpt-4o' };
const ANTHROPIC_DEFAULTS = { modelId: 'claude-sonnet-4-20250514' };

const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100';

export function SettingsPanel({ config, systemPrompt, onSave, hasApiKey, saveApiKey }: SettingsPanelProps) {
  // Provider selector
  const [provider, setProvider] = useState<Provider>(config.model?.provider ?? 'bedrock');

  // Per-provider state (all retained simultaneously)
  const [bedrockModelId, setBedrockModelId] = useState(config.model?.bedrock?.modelId ?? BEDROCK_DEFAULTS.modelId);
  const [bedrockRegion, setBedrockRegion] = useState(config.model?.bedrock?.region ?? BEDROCK_DEFAULTS.region);
  const [bedrockProfile, setBedrockProfile] = useState(config.model?.bedrock?.profile ?? '');

  const [ollamaHost, setOllamaHost] = useState(config.model?.ollama?.host ?? OLLAMA_DEFAULTS.host);
  const [ollamaModelId, setOllamaModelId] = useState(config.model?.ollama?.modelId ?? OLLAMA_DEFAULTS.modelId);

  const [openaiModelId, setOpenaiModelId] = useState(config.model?.openai?.modelId ?? OPENAI_DEFAULTS.modelId);
  const [anthropicModelId, setAnthropicModelId] = useState(config.model?.anthropic?.modelId ?? ANTHROPIC_DEFAULTS.modelId);

  // API key state (for openai/anthropic)
  const [apiKey, setApiKey] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);

  // Common settings
  const [timeoutMs, setTimeoutMs] = useState(config.sandbox?.timeoutMs ?? 45000);
  const [networkUnrestricted, setNetworkUnrestricted] = useState(
    !config.sandbox?.allowedDomains || config.sandbox.allowedDomains.length === 0
  );
  const [maxTurns, setMaxTurns] = useState(config.agent?.maxTurns ?? 100);

  // UI state
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { clearTimeout(savedTimerRef.current); };
  }, []);

  // T019: Sync form state when config prop changes externally
  useEffect(() => {
    setProvider(config.model?.provider ?? 'bedrock');
    setBedrockModelId(config.model?.bedrock?.modelId ?? BEDROCK_DEFAULTS.modelId);
    setBedrockRegion(config.model?.bedrock?.region ?? BEDROCK_DEFAULTS.region);
    setBedrockProfile(config.model?.bedrock?.profile ?? '');
    setOllamaHost(config.model?.ollama?.host ?? OLLAMA_DEFAULTS.host);
    setOllamaModelId(config.model?.ollama?.modelId ?? OLLAMA_DEFAULTS.modelId);
    setOpenaiModelId(config.model?.openai?.modelId ?? OPENAI_DEFAULTS.modelId);
    setAnthropicModelId(config.model?.anthropic?.modelId ?? ANTHROPIC_DEFAULTS.modelId);
    setTimeoutMs(config.sandbox?.timeoutMs ?? 45000);
    setNetworkUnrestricted(!config.sandbox?.allowedDomains || config.sandbox.allowedDomains.length === 0);
    setMaxTurns(config.agent?.maxTurns ?? 100);
  }, [config]);

  // Check if API key exists in Stronghold when provider changes
  useEffect(() => {
    const needsKey = provider === 'openai' || provider === 'anthropic';
    if (needsKey && hasApiKey) {
      hasApiKey(provider).then(setHasStoredKey).catch(() => setHasStoredKey(false));
    } else {
      setHasStoredKey(false);
    }
    setApiKey('');
  }, [provider, hasApiKey]);

  // T018 + T030: handleSave with validation
  const handleSave = async () => {
    try {
      setSaveError(null);

      // FR-006b: Validate required credentials before save
      const needsKey = provider === 'openai' || provider === 'anthropic';
      if (needsKey && !hasStoredKey && !apiKey.trim()) {
        const label = provider === 'openai' ? 'OpenAI' : 'Anthropic';
        setSaveError(`API key required for ${label}`);
        return;
      }

      // Save API key to Stronghold if user entered a new one
      if (needsKey && apiKey.trim() && saveApiKey) {
        await saveApiKey(provider, apiKey.trim());
        setHasStoredKey(true);
        setApiKey('');
      }

      // Serialize full config with nested provider blocks (all retained)
      await onSave({
        model: {
          provider,
          bedrock: { modelId: bedrockModelId, region: bedrockRegion, profile: bedrockProfile || undefined },
          ollama: { host: ollamaHost, modelId: ollamaModelId },
          openai: { modelId: openaiModelId },
          anthropic: { modelId: anthropicModelId },
        },
        sandbox: { timeoutMs, allowedDomains: networkUnrestricted ? [] : config.sandbox?.allowedDomains ?? [] },
        agent: { maxTurns },
      });

      setSaved(true);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
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

        {/* Provider Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            AI Provider
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className={inputClass}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Provider-specific fields */}
        {provider === 'bedrock' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model ID</label>
              <input type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={bedrockModelId} onChange={(e) => setBedrockModelId(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">AWS Region</label>
              <input type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={bedrockRegion} onChange={(e) => setBedrockRegion(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">AWS Profile</label>
              <input type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={bedrockProfile} onChange={(e) => setBedrockProfile(e.target.value)} placeholder="default" className={inputClass} />
              <p className="text-xs text-gray-400 mt-1">AWS credentials profile from ~/.aws/credentials</p>
            </div>
          </>
        )}

        {provider === 'ollama' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ollama Host URL</label>
              <input type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={ollamaHost} onChange={(e) => setOllamaHost(e.target.value)} placeholder="http://localhost:11434" className={inputClass} />
              <p className="text-xs text-gray-400 mt-1">URL where Ollama is running</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model ID</label>
              <input type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={ollamaModelId} onChange={(e) => setOllamaModelId(e.target.value)} placeholder="llama3" className={inputClass} />
              <p className="text-xs text-gray-400 mt-1">Must be pulled in Ollama first: ollama pull {'<model>'}</p>
            </div>
          </>
        )}

        {provider === 'openai' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model ID</label>
              <input type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={openaiModelId} onChange={(e) => setOpenaiModelId(e.target.value)} placeholder="gpt-4o" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API Key {hasStoredKey && <span className="text-green-500 text-xs ml-2">● Stored</span>}
              </label>
              <input type="password" autoComplete="off"
                value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasStoredKey ? '••••••••' : 'Enter OpenAI API key'}
                className={inputClass} />
              <p className="text-xs text-gray-400 mt-1">Stored securely in encrypted vault. Never saved to config file.</p>
            </div>
          </>
        )}

        {provider === 'anthropic' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model ID</label>
              <input type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={anthropicModelId} onChange={(e) => setAnthropicModelId(e.target.value)} placeholder="claude-sonnet-4-20250514" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API Key {hasStoredKey && <span className="text-green-500 text-xs ml-2">● Stored</span>}
              </label>
              <input type="password" autoComplete="off"
                value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasStoredKey ? '••••••••' : 'Enter Anthropic API key'}
                className={inputClass} />
              <p className="text-xs text-gray-400 mt-1">Stored securely in encrypted vault. Never saved to config file.</p>
            </div>
          </>
        )}

        {/* Common settings */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Sandbox Timeout (ms)
          </label>
          <input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} className={inputClass} />
        </div>

        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={networkUnrestricted} onChange={(e) => setNetworkUnrestricted(e.target.checked)} className="rounded" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow unrestricted network access</span>
          </label>
          <p className="text-xs text-gray-400 mt-1 ml-7">
            {networkUnrestricted
              ? 'Tools can fetch any URL. Disable to restrict to specific domains.'
              : `Restricted to: ${(config.sandbox?.allowedDomains ?? []).join(', ') || 'none (all blocked)'}`}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Agent Turns</label>
          <input type="number" value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} className={inputClass} />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            Save & Restart Agent
          </button>
          {saved && <span className="text-sm text-green-400">Saved!</span>}
          {saveError && <span className="text-sm text-red-400">{saveError}</span>}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">System Prompt</h3>
          <pre className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-auto text-gray-600 dark:text-gray-400">
            {systemPrompt}
          </pre>
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-600 pt-2">Config: ~/.tendril/config.json</div>
      </div>
    </div>
  );
}
