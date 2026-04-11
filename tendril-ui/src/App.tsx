import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AgentProvider } from './context/AgentContext';
import { ChatView } from './components/ChatView';
import { CapabilityBrowser } from './components/CapabilityBrowser';
import { SettingsPanel } from './components/SettingsPanel';
import { WorkspaceSetup } from './components/WorkspaceSetup';
import { useCapabilities } from './hooks/useCapabilities';

type Tab = 'chat' | 'capabilities' | 'settings';

const WORKSPACE_PATH = '~/tendril-workspace'.replace('~', '/Users'); // Resolved at runtime

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [hasWorkspace, setHasWorkspace] = useState<boolean | null>(null);
  const [workspacePath, setWorkspacePath] = useState('');
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const { capabilities, loading: capsLoading, refresh: refreshCaps } = useCapabilities(workspacePath);

  useEffect(() => {
    checkWorkspace();
  }, []);

  const checkWorkspace = async () => {
    try {
      // Try common default path
      const home = await getHomePath();
      const path = `${home}/tendril-workspace`;
      setWorkspacePath(path);
      const cfg = await invoke<Record<string, unknown>>('read_config', { path });
      setConfig(cfg);
      setHasWorkspace(true);
      const prompt = await invoke<string>('get_system_prompt');
      setSystemPrompt(prompt);
    } catch {
      setHasWorkspace(false);
    }
  };

  const handleInit = async (path: string) => {
    await invoke('init_workspace', { path });
    setWorkspacePath(path);
    setHasWorkspace(true);
    const cfg = await invoke<Record<string, unknown>>('read_config', { path });
    setConfig(cfg);
  };

  const handleSaveConfig = async (newConfig: unknown) => {
    await invoke('write_config', { path: workspacePath, config: newConfig });
    setConfig(newConfig as Record<string, unknown>);
  };

  if (hasWorkspace === null) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
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
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
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

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <ChatView />}
        {activeTab === 'capabilities' && (
          <CapabilityBrowser
            capabilities={capabilities as never[]}
            loading={capsLoading}
            onRefresh={refreshCaps}
          />
        )}
        {activeTab === 'settings' && config && (
          <SettingsPanel
            config={config as never}
            systemPrompt={systemPrompt}
            onSave={handleSaveConfig}
          />
        )}
      </div>
    </div>
  );
}

async function getHomePath(): Promise<string> {
  // In Tauri, we can use the home dir from the OS
  try {
    const { homeDir } = await import('@tauri-apps/api/path');
    return await homeDir();
  } catch {
    return '/tmp';
  }
}

export default function App() {
  return (
    <AgentProvider>
      <AppContent />
    </AgentProvider>
  );
}
