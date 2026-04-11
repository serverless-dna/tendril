import React, { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

interface DebugEntry {
  id: number;
  direction: string;
  message: unknown;
  timestamp?: string;
}

const directionColors: Record<string, string> = {
  'host→agent': 'text-blue-400',
  'agent→host': 'text-green-400',
  'agent-stderr': 'text-yellow-400',
  'system': 'text-red-400',
};

export function DebugPanel() {
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<{ direction: string; message: unknown; timestamp?: string }>(
      'agent-debug',
      (event) => {
        counterRef.current += 1;
        setEntries((prev) => [
          ...prev.slice(-500), // Keep last 500 entries
          {
            id: counterRef.current,
            direction: event.payload.direction,
            message: event.payload.message,
            timestamp: event.payload.timestamp,
          },
        ]);
      },
    ).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const clear = () => setEntries([]);

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
          <span className="text-xs text-gray-600">{entries.length} messages</span>
          <button onClick={clear} className="text-xs text-gray-500 hover:text-gray-300">
            Clear
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-xs">
        {entries.length === 0 && (
          <div className="text-gray-600 text-center mt-8">
            Waiting for protocol messages...
          </div>
        )}
        {entries.map((entry) => (
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
