import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AgentProvider } from './context/AgentContext';
import { ChatView } from './components/ChatView';
import { CapabilityBrowser } from './components/CapabilityBrowser';
import { SettingsPanel } from './components/SettingsPanel';
import { WorkspaceSetup } from './components/WorkspaceSetup';
import { DebugPanel } from './components/DebugPanel';
import { FileExplorer } from './components/FileExplorer';
import { useCapabilities } from './hooks/useCapabilities';
import type { AppConfig } from './types';
import { hasApiKey, saveApiKey, getAgentEnvVars } from './stronghold';

type Tab = 'chat' | 'capabilities' | 'workspace' | 'settings';

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [debugOpen, setDebugOpen] = useState(false);
  const [hasWorkspace, setHasWorkspace] = useState<boolean | null>(null);
  const [workspacePath, setWorkspacePath] = useState('');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const { capabilities, loading: capsLoading, refresh: refreshCaps } = useCapabilities(workspacePath);

  useEffect(() => {
    loadAppConfig();
  }, []);

  const loadAppConfig = async () => {
    try {
      const cfg = await invoke<AppConfig>('read_config');
      const workspace = cfg.workspace;

      if (workspace) {
        setWorkspacePath(workspace);
        setConfig(cfg);
        setHasWorkspace(true);
        const prompt = await invoke<string>('get_system_prompt');
        setSystemPrompt(prompt);
        const envVars = await getAgentEnvVars(cfg.model?.provider ?? 'bedrock');
        await invoke('connect_agent_cmd', { envVars: envVars.length > 0 ? envVars : null });
      } else {
        setHasWorkspace(false);
      }
    } catch {
      setHasWorkspace(false);
    }
  };

  const handleInit = async (path: string) => {
    await invoke('init_workspace', { path });
    setWorkspacePath(path);
    const cfg = await invoke<AppConfig>('read_config');
    setConfig(cfg);
    setHasWorkspace(true);
    await invoke('connect_agent_cmd', { envVars: null });
  };

  const handleSaveConfig = async (partial: Partial<AppConfig>) => {
    const current = config ?? {};
    // Typed field-level merge for AppConfig
    const merged: AppConfig = {
      ...current,
      ...partial,
      model: { ...(current as AppConfig).model, ...partial.model },
      sandbox: { ...(current as AppConfig).sandbox, ...partial.sandbox },
      registry: { ...(current as AppConfig).registry, ...partial.registry },
      agent: { ...(current as AppConfig).agent, ...partial.agent },
    } as AppConfig;
    await invoke('write_config', { config: merged });
    setConfig(merged);
    const envVars = await getAgentEnvVars(merged.model?.provider ?? 'bedrock');
    await invoke('restart_agent', { envVars: envVars.length > 0 ? envVars : null });
  };

  if (hasWorkspace === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500">
        Loading...
      </div>
    );
  }

  if (!hasWorkspace) {
    return <WorkspaceSetup onInit={handleInit} />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat', label: 'Chat' },
    { id: 'capabilities', label: 'Capabilities' },
    { id: 'workspace', label: 'Workspace' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950">
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setDebugOpen(!debugOpen)}
          className={`px-3 py-2 text-xs font-mono ${
            debugOpen
              ? 'text-green-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
          title="Toggle debug panel"
        >
          {debugOpen ? '⟩ Debug' : '⟨ Debug'}
        </button>
      </div>

      {/* Content + Debug side panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          <div className={activeTab === 'chat' ? 'h-full' : 'hidden'}>
            <ChatView draft={chatDraft} onDraftChange={setChatDraft} />
          </div>
          <div className={activeTab === 'capabilities' ? 'h-full' : 'hidden'}>
            <CapabilityBrowser
              capabilities={capabilities}
              loading={capsLoading}
              onRefresh={refreshCaps}
              workspacePath={workspacePath}
            />
          </div>
          <div className={activeTab === 'workspace' ? 'h-full' : 'hidden'}>
            <FileExplorer workspacePath={workspacePath} />
          </div>
          <div className={activeTab === 'settings' ? 'h-full' : 'hidden'}>
            {config && (
              <SettingsPanel
                config={config}
                systemPrompt={systemPrompt}
                onSave={handleSaveConfig}
                hasApiKey={hasApiKey}
                saveApiKey={saveApiKey}
              />
            )}
          </div>
        </div>

        {/* Debug side panel */}
        {debugOpen && (
          <div className="w-[420px] border-l border-gray-800 flex-shrink-0">
            <DebugPanel />
          </div>
        )}
      </div>
    </div>
  );
}

/** Top-level error boundary to prevent white-screen crashes */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-300 p-8">
          <h1 className="text-xl font-bold text-red-400 mb-4">Something went wrong</h1>
          <p className="text-sm text-gray-400 mb-2 max-w-lg text-center">
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AgentProvider>
        <AppContent />
      </AgentProvider>
    </ErrorBoundary>
  );
}
