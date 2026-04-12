import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Capability {
  name: string;
  capability: string;
  triggers: string[];
  suppression: string[];
  tool_path: string;
  created: string;
  created_by: string;
}

interface CapabilityBrowserProps {
  capabilities: Capability[];
  loading: boolean;
  onRefresh: () => void;
  workspacePath: string;
}

function highlightTypeScript(code: string): React.ReactNode[] {
  const keywords = /\b(const|let|var|function|return|if|else|for|while|import|export|from|async|await|try|catch|throw|new|typeof|instanceof|class|extends|interface|type|as|in|of|switch|case|break|default|continue|do|void|null|undefined|true|false)\b/g;
  const strings = /(["'`])(?:(?!\1|\\).|\\.)*?\1/g;
  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
  const numbers = /\b(\d+\.?\d*)\b/g;

  // Simple approach: split by tokens and colorize
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const tokens: Array<{ index: number; length: number; type: string; text: string }> = [];

  // Collect all tokens
  for (const match of code.matchAll(comments)) {
    tokens.push({ index: match.index!, length: match[0].length, type: 'comment', text: match[0] });
  }
  for (const match of code.matchAll(strings)) {
    tokens.push({ index: match.index!, length: match[0].length, type: 'string', text: match[0] });
  }
  for (const match of code.matchAll(keywords)) {
    tokens.push({ index: match.index!, length: match[0].length, type: 'keyword', text: match[0] });
  }
  for (const match of code.matchAll(numbers)) {
    tokens.push({ index: match.index!, length: match[0].length, type: 'number', text: match[0] });
  }

  // Sort by position, longest match first for overlaps
  tokens.sort((a, b) => a.index - b.index || b.length - a.length);

  // Render non-overlapping tokens
  const colors: Record<string, string> = {
    keyword: 'text-purple-400',
    string: 'text-green-400',
    comment: 'text-gray-500 italic',
    number: 'text-orange-400',
  };

  for (const token of tokens) {
    if (token.index < lastIndex) continue; // skip overlapping
    if (token.index > lastIndex) {
      parts.push(<span key={`p${lastIndex}`}>{code.slice(lastIndex, token.index)}</span>);
    }
    parts.push(
      <span key={`t${token.index}`} className={colors[token.type]}>
        {token.text}
      </span>,
    );
    lastIndex = token.index + token.length;
  }
  if (lastIndex < code.length) {
    parts.push(<span key={`p${lastIndex}`}>{code.slice(lastIndex)}</span>);
  }

  return parts;
}

function CapabilityCard({ cap, workspacePath }: { cap: Capability; workspacePath: string }) {
  const [expanded, setExpanded] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (!expanded && source === null) {
      setLoading(true);
      try {
        const code = await invoke<string>('read_tool_source', {
          workspace: workspacePath,
          name: cap.name,
        });
        setSource(code);
      } catch {
        setSource('// Failed to load source');
      }
      setLoading(false);
    }
    setExpanded(!expanded);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono font-semibold text-sm text-gray-900 dark:text-gray-100">
            {cap.name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{cap.created}</span>
            <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
          </div>
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
      </button>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {/* Suppression rules */}
          {cap.suppression.length > 0 && (
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/30">
              <span className="text-xs font-medium text-gray-500">Suppression:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {cap.suppression.map((s, i) => (
                  <span
                    key={i}
                    className="text-xs bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source code */}
          <div className="bg-gray-950 p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 font-mono">{cap.tool_path ?? `tools/${cap.name}.ts`}</span>
              {source && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(source);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Copy
                </button>
              )}
            </div>
            {loading ? (
              <div className="text-gray-500 text-sm animate-pulse">Loading source...</div>
            ) : source ? (
              <pre className="text-sm font-mono leading-relaxed whitespace-pre-wrap text-gray-300">
                {highlightTypeScript(source)}
              </pre>
            ) : (
              <div className="text-gray-500 text-sm">No source available</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CapabilityBrowser({ capabilities, loading, onRefresh, workspacePath }: CapabilityBrowserProps) {
  useEffect(() => {
    onRefresh();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Capabilities
          {capabilities.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">({capabilities.length})</span>
          )}
        </h2>
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
            <CapabilityCard key={cap.name} cap={cap} workspacePath={workspacePath} />
          ))}
        </div>
      </div>
    </div>
  );
}
