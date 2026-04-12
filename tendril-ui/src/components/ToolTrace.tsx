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
  pending: 'bg-yellow-500/20 text-yellow-300',
  completed: 'bg-green-500/20 text-green-300',
  failed: 'bg-red-500/20 text-red-300',
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
      return input.code ? `${String(input.code).trim().slice(0, 50)}…` : '';
    default: {
      const first = Object.values(input).find((v) => typeof v === 'string' && v.length > 0);
      return first ? String(first).slice(0, 50) : '';
    }
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ToolTrace({ title, input, status, output }: ToolTraceProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeInput(title, input);

  return (
    <div className="ml-4 my-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs w-full text-left py-1 px-2 rounded hover:bg-gray-800/50"
      >
        <Chevron open={expanded} />
        <span className="font-mono font-semibold text-gray-200">{title}</span>
        {summary && (
          <span className="text-gray-500 truncate max-w-[280px] font-mono">{summary}</span>
        )}
        <span className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${statusColors[status]}`}>
          {status}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 ml-5 space-y-2 text-xs">
          <div className="rounded border border-gray-700 bg-gray-900 p-3">
            <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1.5">Input</div>
            <pre className="font-mono whitespace-pre-wrap text-gray-300 leading-relaxed">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>
          {output && (
            <div className="rounded border border-gray-700 bg-gray-900 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-gray-500 text-[10px] uppercase tracking-wider">Output</span>
                <button
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(output); }}
                  className="text-[10px] text-gray-600 hover:text-gray-400"
                >
                  Copy
                </button>
              </div>
              <pre className="font-mono whitespace-pre-wrap text-gray-300 leading-relaxed max-h-48 overflow-auto">
                {output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
