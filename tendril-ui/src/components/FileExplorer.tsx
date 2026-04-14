import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { CodeEditor } from './CodeEditor';

const streamdownPlugins = { code };

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

interface FileExplorerProps {
  workspacePath: string;
}

export function FileExplorer({ workspacePath }: FileExplorerProps) {
  const [currentPath, setCurrentPath] = useState(workspacePath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ name: string; path: string; content: string } | null>(null);
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorContentRef = useRef<string | null>(null);
  const [viewMode, setViewMode] = useState<'code' | 'doc'>('code');

  const isMarkdown = selectedFile?.name.endsWith('.md') ?? false;
  const isDirty = editedContent !== null && selectedFile !== null && editedContent !== selectedFile.content;

  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<FileEntry[]>('list_directory', { dirPath });
      setEntries(result);
      setCurrentPath(dirPath);
      setSelectedFile(null);
      setEditedContent(null);
      editorContentRef.current = null;
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
        setSelectedFile({ name: entry.name, path: entry.path, content });
        setEditedContent(null);
        editorContentRef.current = null;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleSave = useCallback(async () => {
    if (!selectedFile || editorContentRef.current === null) return;
    const content = editorContentRef.current;
    setSaving(true);
    try {
      await invoke('write_file_content', { filePath: selectedFile.path, content });
      setSelectedFile({ ...selectedFile, content });
      setEditedContent(null);
      editorContentRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [selectedFile]);

  const handleChange = useCallback((value: string) => {
    editorContentRef.current = value;
    setEditedContent(value);
  }, []);

  // Ctrl/Cmd+S to save
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  const goUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/');
    if (parent && parent.length >= workspacePath.length) {
      loadDirectory(parent);
    }
  };

  const breadcrumbs = currentPath.replace(workspacePath, '').split('/').filter(Boolean);

  const openInExplorer = () => {
    const target = selectedFile ? selectedFile.path.split('/').slice(0, -1).join('/') : currentPath;
    invoke('reveal_in_file_explorer', { path: target });
  };

  // Show the workspace folder name (last segment of the path)
  const workspaceName = workspacePath.split('/').filter(Boolean).pop() ?? 'workspace';

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{workspaceName}</h2>
          <p className="text-xs font-mono text-gray-500 truncate">{workspacePath}</p>
        </div>
        <button
          onClick={openInExplorer}
          title="Open in file explorer"
          className="text-xs px-2 py-1 text-gray-400 hover:text-gray-200 border border-gray-700 rounded hover:border-gray-500 transition-colors"
        >
          Open in Finder
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-2 text-xs font-mono text-gray-500 border-b border-gray-800 bg-gray-900/50 overflow-x-auto">
        <button onClick={() => loadDirectory(workspacePath)} className="hover:text-gray-300 flex-shrink-0">
          {workspaceName}
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

      <div className="flex flex-1 min-h-0 overflow-hidden">
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
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-gray-950">
          {selectedFile ? (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500">{selectedFile.name}</span>
                  {isDirty && <span className="text-xs text-yellow-500">modified</span>}
                </div>
                <div className="flex items-center gap-2">
                  {isMarkdown && (
                    <div className="flex border border-gray-700 rounded overflow-hidden">
                      <button
                        onClick={() => setViewMode('doc')}
                        title="Document view"
                        className={`px-2 py-1 text-xs ${viewMode === 'doc' ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setViewMode('code')}
                        title="Code view"
                        className={`px-2 py-1 text-xs ${viewMode === 'code' ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="16 18 22 12 16 6" />
                          <polyline points="8 6 2 12 8 18" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {isDirty && (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                </div>
              </div>
              {isMarkdown && viewMode === 'doc' ? (
                <div className="flex-1 min-h-0 overflow-auto p-6 prose prose-invert prose-sm max-w-none">
                  <Streamdown plugins={streamdownPlugins}>{selectedFile.content}</Streamdown>
                </div>
              ) : (
                <CodeEditor
                  value={selectedFile.content}
                  filename={selectedFile.name}
                  onChange={handleChange}
                  className="flex-1 min-h-0 overflow-hidden"
                />
              )}
            </>
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
