import React, { useEffect } from 'react';

interface Capability {
  name: string;
  capability: string;
  triggers: string[];
  suppression: string[];
  created: string;
  created_by: string;
}

interface CapabilityBrowserProps {
  capabilities: Capability[];
  loading: boolean;
  onRefresh: () => void;
}

export function CapabilityBrowser({ capabilities, loading, onRefresh }: CapabilityBrowserProps) {
  useEffect(() => {
    onRefresh();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Capabilities</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {capabilities.length === 0 && !loading && (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-lg">No capabilities yet</p>
            <p className="text-sm mt-2">Tendril will create tools as you chat</p>
          </div>
        )}

        <div className="space-y-3">
          {capabilities.map((cap) => (
            <div
              key={cap.name}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono font-semibold text-sm text-gray-900 dark:text-gray-100">
                  {cap.name}
                </h3>
                <span className="text-xs text-gray-400">{cap.created}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{cap.capability}</p>
              <div className="flex flex-wrap gap-1">
                {cap.triggers.map((t, i) => (
                  <span
                    key={i}
                    className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
