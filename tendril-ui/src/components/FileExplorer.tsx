import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

const fileIcons: Record<string, string> = {
  ts: '📄',
  js: '📄',
  json: '📋',
  md: '📝',
  toml: '⚙️',
  default_file: '📄',
  directory: '📁',
};

function getIcon(entry: FileEntry): string {
  if (entry.is_dir) return fileIcons.directory;
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  return fileIcons[ext] ?? fileIcons.default_file;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function highlightCode(code: string, filename: string): React.ReactNode[] {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext !== 'ts' && ext !== 'js') {
    return [<span key="0">{code}</span>];
  }

  const keywords = /\b(const|let|var|function|return|if|else|for|while|import|export|from|async|await|try|catch|throw|new|typeof|instanceof|class|extends|interface|type|as|in|of|void|null|undefined|true|false)\b/g;
  const strings = /(["'`])(?:(?!\1|\\).|\\.)*?\1/g;
  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
  const numbers = /\b(\d+\.?\d*)\b/g;

  const tokens: Array<{ index: number; length: number; cls: string; text: string }> = [];
  for (const m of code.matchAll(comments)) tokens.push({ index: m.index!, length: m[0].length, cls: 'text-gray-500 italic', text: m[0] });
  for (const m of code.matchAll(strings)) tokens.push({ index: m.index!, length: m[0].length, cls: 'text-green-400', text: m[0] });
  for (const m of code.matchAll(keywords)) tokens.push({ index: m.index!, length: m[0].length, cls: 'text-purple-400', text: m[0] });
  for (const m of code.matchAll(numbers)) tokens.push({ index: m.index!, length: m[0].length, cls: 'text-orange-400', text: m[0] });

  tokens.sort((a, b) => a.index - b.index || b.length - a.length);

  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const t of tokens) {
    if (t.index < last) continue;
    if (t.index > last) parts.push(<span key={`p${last}`}>{code.slice(last, t.index)}</span>);
    parts.push(<span key={`t${t.index}`} className={t.cls}>{t.text}</span>);
    last = t.index + t.length;
  }
  if (last < code.length) parts.push(<span key={`p${last}`}>{code.slice(last)}</span>);
  return parts;
}

interface FileExplorerProps {
  workspacePath: string;
}

export function FileExplorer({ workspacePath }: FileExplorerProps) {
  const [currentPath, setCurrentPath] = useState(workspacePath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ name: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<FileEntry[]>('list_directory', { dirPath });
      setEntries(result);
      setCurrentPath(dirPath);
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory(workspacePath);
  }, [workspacePath, loadDirectory]);

  const handleClick = async (entry: FileEntry) => {
    if (entry.is_dir) {
      await loadDirectory(entry.path);
    } else {
      try {
        const content = await invoke<string>('read_file_content', { filePath: entry.path });
        setSelectedFile({ name: entry.name, content });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const goUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/');
    if (parent && parent.length >= workspacePath.length) {
      loadDirectory(parent);
    }
  };

  const breadcrumbs = currentPath.replace(workspacePath, '').split('/').filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Workspace</h2>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-2 text-xs font-mono text-gray-500 border-b border-gray-800 bg-gray-900/50 overflow-x-auto">
        <button onClick={() => loadDirectory(workspacePath)} className="hover:text-gray-300 flex-shrink-0">
          ~/workspace
        </button>
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={i}>
            <span className="text-gray-700">/</span>
            <button
              onClick={() => loadDirectory(workspacePath + '/' + breadcrumbs.slice(0, i + 1).join('/'))}
              className="hover:text-gray-300 flex-shrink-0"
            >
              {crumb}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File tree */}
        <div className="w-64 flex-shrink-0 border-r border-gray-800 overflow-y-auto">
          {currentPath !== workspacePath && (
            <button
              onClick={goUp}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 flex items-center gap-2"
            >
              <span>⬆️</span>
              <span>..</span>
            </button>
          )}
          {loading && <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>}
          {error && <div className="px-3 py-2 text-sm text-red-400">{error}</div>}
          {entries.map((entry) => (
            <button
              key={entry.path}
              onClick={() => handleClick(entry)}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-800 flex items-center gap-2 ${
                selectedFile?.name === entry.name ? 'bg-gray-800 text-gray-100' : 'text-gray-400'
              }`}
            >
              <span className="flex-shrink-0 text-xs">{getIcon(entry)}</span>
              <span className="truncate">{entry.name}</span>
              {!entry.is_dir && (
                <span className="ml-auto text-xs text-gray-600 flex-shrink-0">{formatSize(entry.size)}</span>
              )}
            </button>
          ))}
          {!loading && entries.length === 0 && (
            <div className="px-3 py-4 text-sm text-gray-600 text-center">Empty directory</div>
          )}
        </div>

        {/* File content */}
        <div className="flex-1 overflow-auto bg-gray-950">
          {selectedFile ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-gray-500">{selectedFile.name}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(selectedFile.content)}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Copy
                </button>
              </div>
              <pre className="text-sm font-mono leading-relaxed whitespace-pre-wrap text-gray-300">
                {highlightCode(selectedFile.content, selectedFile.name)}
              </pre>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              Select a file to view its contents
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
