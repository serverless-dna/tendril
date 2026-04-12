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

function summarizeInput(title: string, input: Record<string, unknown>): string {
  switch (title) {
    case 'searchCapabilities':
      return input.query ? `"${input.query}"` : '';
    case 'loadTool':
      return input.name ? String(input.name) : '';
    case 'registerCapability': {
      const def = input.definition as Record<string, unknown> | undefined;
      return def?.name ? String(def.name) : '';
    }
    case 'execute':
      return input.code ? `${String(input.code).slice(0, 60).trim()}...` : '';
    default: {
      const first = Object.values(input).find((v) => typeof v === 'string' && v.length > 0);
      return first ? String(first).slice(0, 60) : '';
    }
  }
}

export function ToolTrace({ title, input, status, output }: ToolTraceProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeInput(title, input);

  return (
    <div className="ml-4 my-1 border-l-2 border-gray-300 dark:border-gray-600 pl-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 w-full text-left"
      >
        <span className="font-mono font-semibold text-gray-300">{title}</span>
        {summary && (
          <span className="text-gray-500 truncate max-w-[300px]">{summary}</span>
        )}
        <span className={`px-1.5 py-0.5 rounded text-xs flex-shrink-0 ${statusColors[status]}`}>
          {status}
        </span>
        <span className="ml-auto flex-shrink-0">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="mt-1 text-xs">
          <div className="bg-gray-50 dark:bg-gray-900 rounded p-2 mb-1">
            <div className="text-gray-500 mb-1">Input:</div>
            <pre className="font-mono whitespace-pre-wrap text-gray-400">{JSON.stringify(input, null, 2)}</pre>
          </div>
          {output && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
              <div className="text-gray-500 mb-1">Output:</div>
              <pre className="font-mono whitespace-pre-wrap max-h-40 overflow-auto text-gray-400">{output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
