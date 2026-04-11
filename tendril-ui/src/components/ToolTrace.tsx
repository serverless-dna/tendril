import React, { useState } from 'react';

interface ToolTraceProps {
  toolCallId: string;
  title: string;
  kind: string;
  input: Record<string, unknown>;
  status: 'pending' | 'completed' | 'failed';
  output?: string;
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

export function ToolTrace({ title, kind, input, status, output }: ToolTraceProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="ml-4 my-1 border-l-2 border-gray-300 pl-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 w-full text-left"
      >
        <span className="font-mono font-semibold">{title}</span>
        <span className="text-gray-400">({kind})</span>
        <span className={`px-1.5 py-0.5 rounded text-xs ${statusColors[status]}`}>
          {status}
        </span>
        <span className="ml-auto">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="mt-1 text-xs">
          <div className="bg-gray-50 dark:bg-gray-900 rounded p-2 mb-1">
            <div className="text-gray-500 mb-1">Input:</div>
            <pre className="font-mono whitespace-pre-wrap">{JSON.stringify(input, null, 2)}</pre>
          </div>
          {output && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
              <div className="text-gray-500 mb-1">Output:</div>
              <pre className="font-mono whitespace-pre-wrap max-h-40 overflow-auto">{output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
