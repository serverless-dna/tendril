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

type Tab = 'chat' | 'capabilities' | 'workspace' | 'settings';

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [debugOpen, setDebugOpen] = useState(false);
  const [hasWorkspace, setHasWorkspace] = useState<boolean | null>(null);
  const [workspacePath, setWorkspacePath] = useState('');
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const { capabilities, loading: capsLoading, refresh: refreshCaps } = useCapabilities(workspacePath);

  useEffect(() => {
    loadAppConfig();
  }, []);

  const loadAppConfig = async () => {
    try {
      const cfg = await invoke<Record<string, unknown>>('read_config');
      const workspace = cfg.workspace as string | null;

      if (workspace) {
        setWorkspacePath(workspace);
        setConfig(cfg);
        setHasWorkspace(true);
        const prompt = await invoke<string>('get_system_prompt');
        setSystemPrompt(prompt);
        await invoke('connect_agent_cmd');
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
    const cfg = await invoke<Record<string, unknown>>('read_config');
    setConfig(cfg);
    setHasWorkspace(true);
    await invoke('connect_agent_cmd');
  };

  const handleSaveConfig = async (partial: unknown) => {
    const merged = deepMerge(config ?? {}, partial as Record<string, unknown>);
    await invoke('write_config', { config: merged });
    setConfig(merged);
    await invoke('restart_agent');
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
                if (tab.id === 'capabilities') refreshCaps();
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
          {activeTab === 'chat' && <ChatView />}
          {activeTab === 'capabilities' && (
            <CapabilityBrowser
              capabilities={capabilities as never[]}
              loading={capsLoading}
              onRefresh={refreshCaps}
              workspacePath={workspacePath}
            />
          )}
          {activeTab === 'workspace' && <FileExplorer workspacePath={workspacePath} />}
        {activeTab === 'settings' && config && (
            <SettingsPanel
              config={config as never}
              systemPrompt={systemPrompt}
              onSave={handleSaveConfig}
            />
          )}
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

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null
    ) {
      result[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

export default function App() {
  return (
    <AgentProvider>
      <AppContent />
    </AgentProvider>
  );
}
