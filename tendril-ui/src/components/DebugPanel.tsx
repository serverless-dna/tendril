import React, { useEffect, useRef, useState } from 'react';
import { useAgentState } from '../context/AgentContext';

const directionColors: Record<string, string> = {
  'host→agent': 'text-blue-400',
  'agent→host': 'text-green-400',
  'agent-stderr': 'text-yellow-400',
  'system': 'text-red-400',
};

export function DebugPanel() {
  const { debugLog } = useAgentState();
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [debugLog, autoScroll]);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300">Protocol Debug</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
          <span className="text-xs text-gray-600">{debugLog.length} messages</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-xs">
        {debugLog.length === 0 && (
          <div className="text-gray-600 text-center mt-8">
            Waiting for protocol messages...
          </div>
        )}
        {debugLog.map((entry) => (
          <div key={entry.id} className="mb-1 border-b border-gray-900 pb-1">
            <span className={`font-bold ${directionColors[entry.direction] ?? 'text-gray-500'}`}>
              {entry.direction}
            </span>
            {entry.timestamp && (
              <span className="text-gray-700 ml-2">{entry.timestamp}</span>
            )}
            <pre className="text-gray-400 whitespace-pre-wrap break-all mt-0.5">
              {typeof entry.message === 'string'
                ? entry.message
                : JSON.stringify(entry.message, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
